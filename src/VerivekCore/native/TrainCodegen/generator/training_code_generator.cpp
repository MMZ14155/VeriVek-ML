#include "training_code_generator.h"

#include <charconv>
#include <utility>

namespace train_codegen {
    namespace {
        // 将 double 格式化为 Python str(float) 等价形式（f-string 中 {lr} 的效果）
        std::string format_python_float(double value) {
            char buf[64];
            auto res = std::to_chars(buf, buf + sizeof(buf), value, std::chars_format::general);
            std::string s(buf, res.ptr);
            // Python repr 对整数取值的浮点数会保留 ".0"
            if (s.find_first_of(".eE") == std::string::npos && s != "inf" && s != "-inf" && s != "nan") {
                s += ".0";
            }
            return s;
        }
    }

    TrainingCodeGenerator::TrainingCodeGenerator(
        std::string model_class_name,
        Hyperparameters hyperparameters,
        DatasetConfig dataset_config
    )
        : model_class_name_(std::move(model_class_name))
        , hyperparams_(std::move(hyperparameters))
        , dataset_config_(std::move(dataset_config))
    {}

    std::string TrainingCodeGenerator::generate() const {
        static const char* separator = "\n\n";

        std::string script;
        script += generate_imports();
        script += separator; script += generate_hyperparams();
        script += separator; script += generate_data_loaders();
        script += separator; script += generate_model_instantiation();
        script += separator; script += generate_loss_optimizer_scheduler();
        script += separator; script += generate_train_validate_funcs();
        script += separator; script += generate_train_model_func();
        script += separator; script += generate_main_block();
        return script;
    }

    std::string TrainingCodeGenerator::generate_imports() const {
        return R"TCG(import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader
from torchvision import datasets, transforms
import os
import time
import copy
import json
import inspect
from typing import Dict, List, Tuple)TCG";
    }

    std::string TrainingCodeGenerator::generate_hyperparams() const {
        // DATA_ROOT 中的反斜杠替换为正斜杠（对应 Python 版 data_root.replace(chr(92), '/')）
        std::string data_root = dataset_config_.data_root;
        for (auto& ch : data_root) {
            if (ch == '\\') ch = '/';
        }

        std::string out = "# ==================== 超参数配置 ====================\n";
        out += "BATCH_SIZE = " + std::to_string(hyperparams_.batch_size) + "\n";
        out += "EPOCHS = " + std::to_string(hyperparams_.epochs) + "\n";
        out += "LEARNING_RATE = " + format_python_float(hyperparams_.lr) + "\n";
        out += "NUM_CLASSES = " + std::to_string(dataset_config_.num_classes) + "\n";
        out += "DATA_ROOT = r\"" + data_root + "\"\n";
        out += R"TCG(BEST_MODEL_SAVE_PATH = "./best_model.pth"
LAST_MODEL_SAVE_PATH = "./last_model.pth"
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")
SEED = 42
torch.manual_seed(SEED))TCG";
        return out;
    }

    std::string TrainingCodeGenerator::generate_data_loaders() const {
        std::string out = R"TCG(# ==================== 数据加载（无预处理，仅转Tensor）====================
# 自动检测数据集结构：支持 train/val 子目录，或单目录自动拆分
transform = transforms.Compose([
    transforms.ToTensor()           # 将 PIL 图像转为 [0,1] 的 Tensor
])

from torch.utils.data import random_split

train_dir = os.path.join(DATA_ROOT, "train")
val_dir = os.path.join(DATA_ROOT, "val")

if os.path.isdir(train_dir) and os.path.isdir(val_dir):
    # 标准结构：已有 train/val 拆分
    train_dataset = datasets.ImageFolder(train_dir, transform=transform)
    val_dataset = datasets.ImageFolder(val_dir, transform=transform)
    print("检测到预拆分的数据集结构 (train/val)")
else:
    # 单目录结构：自动按 80/20 拆分
    full_dataset = datasets.ImageFolder(DATA_ROOT, transform=transform)
    total = len(full_dataset)
    train_size = int(0.8 * total)
    val_size = total - train_size
    train_dataset, val_dataset = random_split(
        full_dataset, [train_size, val_size],
        generator=torch.Generator().manual_seed(SEED)
    )
    print("检测到单目录数据集，自动按 80/20 拆分为训练集和验证集")

train_loader = DataLoader(train_dataset, batch_size=BATCH_SIZE, shuffle=True, num_workers=4)
val_loader = DataLoader(val_dataset, batch_size=BATCH_SIZE, shuffle=False, num_workers=4)

print(f"训练集样本数: {len(train_dataset)}")
print(f"验证集样本数: {len(val_dataset)}")
if hasattr(train_dataset, 'classes'):
    print(f"类别映射: {train_dataset.classes}")  # 应为 )TCG";
        out += std::to_string(dataset_config_.num_classes);
        out += R"TCG( 个类别
else:
    print(f"类别映射: {full_dataset.classes}"))TCG";
        return out;
    }

    std::string TrainingCodeGenerator::generate_model_instantiation() const {
        return R"TCG(# ==================== 实例化模型 ====================
import model

# 自动检测 model.py 中定义了 forward 方法的模型类
_model_class = None
for name, obj in inspect.getmembers(model, inspect.isclass):
    # 确保 forward 是在该类自身定义的，而不是从 nn.Module 继承的
    if hasattr(obj, 'forward') and 'forward' in obj.__dict__:
        _model_class = obj
        print(f"自动检测到模型类: {name}")
        break

if _model_class is None:
    raise ImportError("在 model.py 中未找到定义 forward 方法的模型类")

model = _model_class(num_classes=NUM_CLASSES).to(DEVICE))TCG";
    }

    std::string TrainingCodeGenerator::generate_loss_optimizer_scheduler() const {
        const std::string& opt_name = hyperparams_.optimizer;

        std::string opt_line;
        if (opt_name == "SGD") {
            opt_line = "optimizer = optim.SGD(model.parameters(), lr=LEARNING_RATE, momentum=0.9, weight_decay=0)";
        } else if (opt_name == "AdamW") {
            opt_line = "optimizer = optim.AdamW(model.parameters(), lr=LEARNING_RATE, betas=(0.9, 0.999), weight_decay=0)";
        } else {
            // Adam 及未知优化器均回退到 Adam（与 Python 版行为一致）
            opt_line = "optimizer = optim.Adam(model.parameters(), lr=LEARNING_RATE, betas=(0.9, 0.999), weight_decay=0)";
        }

        std::string out = "# ==================== 损失函数与优化器 ====================\n";
        out += "criterion = nn.CrossEntropyLoss()\n";
        out += opt_line + "\n";
        out += "scheduler = optim.lr_scheduler.StepLR(optimizer, step_size=7, gamma=0.1)";
        return out;
    }

    std::string TrainingCodeGenerator::generate_train_validate_funcs() const {
        return R"TCG(# ==================== 训练与验证函数 ====================
def train_one_epoch(model, loader, criterion, optimizer, device):
    model.train()
    running_loss = 0.0
    correct = 0
    total = 0

    for images, labels in loader:
        images, labels = images.to(device), labels.to(device)

        optimizer.zero_grad()
        outputs = model(images)
        loss = criterion(outputs, labels)
        loss.backward()
        optimizer.step()

        running_loss += loss.item() * images.size(0)
        _, preds = torch.max(outputs, 1)
        correct += (preds == labels).sum().item()
        total += labels.size(0)

    epoch_loss = running_loss / total
    epoch_acc = correct / total
    return epoch_loss, epoch_acc

def validate(model, loader, criterion, device):
    model.eval()
    running_loss = 0.0
    correct = 0
    total = 0

    with torch.no_grad():
        for images, labels in loader:
            images, labels = images.to(device), labels.to(device)
            outputs = model(images)
            loss = criterion(outputs, labels)

            running_loss += loss.item() * images.size(0)
            _, preds = torch.max(outputs, 1)
            correct += (preds == labels).sum().item()
            total += labels.size(0)

    epoch_loss = running_loss / total
    epoch_acc = correct / total
    return epoch_loss, epoch_acc)TCG";
    }

    std::string TrainingCodeGenerator::generate_train_model_func() const {
        return R"TCG(# ==================== 主训练函数（返回耗时、损失率、验证准确率） ====================
def train_model(model, train_loader, val_loader, criterion, optimizer, scheduler,
                device, epochs, best_save_path, last_save_path):
    """
    训练模型并返回训练历史与关键指标
    返回:
        history: dict, 包含 'time', 'train_loss', 'train_acc', 'val_loss', 'val_acc' 列表
        best_val_acc: float, 最佳验证准确率
        total_time: float, 总训练耗时（秒）
    """
    history = {
        'time': [],
        'train_loss': [],
        'train_acc': [],
        'val_loss': [],
        'val_acc': []
    }
    best_val_acc = 0.0
    best_model_wts = copy.deepcopy(model.state_dict())
    total_start = time.time()

    for epoch in range(1, epochs + 1):
        epoch_start = time.time()
        train_loss, train_acc = train_one_epoch(model, train_loader, criterion, optimizer, device)
        val_loss, val_acc = validate(model, val_loader, criterion, device)
        scheduler.step()
        epoch_time = time.time() - epoch_start

        # 记录历史
        history['time'].append(epoch_time)
        history['train_loss'].append(train_loss)
        history['train_acc'].append(train_acc)
        history['val_loss'].append(val_loss)
        history['val_acc'].append(val_acc)

        print(f"Epoch {epoch:2d}/{epochs} | "
              f"Train Loss: {train_loss:.4f} | Train Acc: {train_acc:.4f} | "
              f"Val Loss: {val_loss:.4f} | Val Acc: {val_acc:.4f} | "
              f"Time: {epoch_time:.2f}s | LR: {optimizer.param_groups[0]['lr']:.6f}")

        # 输出 JSON 指标行，供日志采集器解析
        print(json.dumps({"metrics": {
            "epoch": epoch,
            "train_loss": round(train_loss, 6),
            "train_acc": round(train_acc, 6),
            "val_loss": round(val_loss, 6),
            "val_acc": round(val_acc, 6),
            "best_val_acc": round(best_val_acc, 6),
            "lr": round(optimizer.param_groups[0]['lr'], 8)
        }}))

        # 每轮保存 last 模型（覆盖）
        torch.save(model.state_dict(), last_save_path)

        if val_acc > best_val_acc:
            best_val_acc = val_acc
            best_model_wts = copy.deepcopy(model.state_dict())
            torch.save(best_model_wts, best_save_path)
            print(f"  -> 保存最佳模型 (Val Acc: {val_acc:.4f})")

    total_time = time.time() - total_start
    print(f"\n训练完成！最佳验证准确率: {best_val_acc:.4f}，总耗时: {total_time:.2f}s")
    print(f"最佳模型已保存至: {best_save_path}")

    return history, best_val_acc, total_time)TCG";
    }

    std::string TrainingCodeGenerator::generate_main_block() const {
        return R"TCG(# ==================== 执行训练并获取指标 ====================
if __name__ == "__main__":
    history, best_acc, total_time = train_model(
        model, train_loader, val_loader, criterion, optimizer, scheduler,
        device=DEVICE, epochs=EPOCHS,
        best_save_path=BEST_MODEL_SAVE_PATH, last_save_path=LAST_MODEL_SAVE_PATH
    )

    # 打印部分历史数据
    print("\n===== 训练历史摘要 =====")
    print(f"最终训练损失: {history['train_loss'][-1]:.4f}")
    print(f"最终验证准确率: {history['val_acc'][-1]:.4f}")
    print(f"最佳验证准确率: {best_acc:.4f}")
    print(f"总耗时: {total_time:.2f} 秒")

    # 输出最终指标 JSON，供后端解析
    print(json.dumps({"final_metrics": {
        "best_val_acc": round(best_acc, 6),
        "last_val_acc": round(history['val_acc'][-1], 6),
        "last_train_loss": round(history['train_loss'][-1], 6),
        "last_val_loss": round(history['val_loss'][-1], 6),
        "last_train_acc": round(history['train_acc'][-1], 6)
    }, "total_time": round(total_time, 2)})))TCG";
    }

    std::string TrainingCodeGenerator::get_hyperparameter_schema() const {
        return R"TCG({
  "epochs": {
    "type": "integer",
    "default": 50,
    "min": 1,
    "max": 1000,
    "description": "训练轮数",
    "required": true
  },
  "batch_size": {
    "type": "select",
    "options": [
      16,
      32,
      64,
      128,
      256
    ],
    "default": 32,
    "description": "批次大小",
    "required": true
  },
  "lr": {
    "type": "float",
    "default": 0.001,
    "min": 0.0001,
    "max": 0.1,
    "step": 0.0001,
    "description": "学习率",
    "required": true
  },
  "optimizer": {
    "type": "select",
    "options": [
      "Adam",
      "SGD",
      "AdamW"
    ],
    "default": "Adam",
    "description": "优化器",
    "required": true
  }
})TCG";
    }

    std::string generate_training_script(const std::string& model_class_name,
                                        const Hyperparameters& hyperparameters,
                                        const std::string& data_root,
                                        int num_classes) {
        DatasetConfig dataset_config;
        dataset_config.type = "image";
        dataset_config.data_root = data_root;
        dataset_config.num_classes = num_classes;

        TrainingCodeGenerator generator(model_class_name, hyperparameters, dataset_config);
        return generator.generate();
    }
}