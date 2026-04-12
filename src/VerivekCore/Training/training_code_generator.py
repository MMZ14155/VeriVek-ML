import json
from typing import Dict, Any, Optional, List

# 数据集格式要求：
# 数据集根目录（DATA_ROOT）下需包含 train 和 val 两个子文件夹，每个子文件夹内按类别存放图像。
# 示例结构：
#   data/
#   ├── train/
#   │   ├── class_0/        # 第1类图像
#   │   │   ├── img1.jpg
#   │   │   ├── img2.png
#   │   │   └── ...
#   │   ├── class_1/        # 第2类图像
#   │   ├── class_2/        # 第3类图像
#   │   └── class_3/        # 第4类图像
#   └── val/
#       ├── class_0/
#       ├── class_1/
#       ├── class_2/
#       └── class_3/
# 类别文件夹名称可任意，脚本会自动映射为整数标签（0,1,2,3）。
# 图像格式支持常见格式（jpg, png, bmp等），需要提前预处理，脚本内部仅执行 ToTensor() 转换。

class TrainingCodeGenerator:
    """
    训练代码生成器 - 根据超参数配置生成完整的训练脚本
    生成的代码风格与用户提供的 train.py 完全一致，支持图像分类，无数据增强
    """

    DEFAULT_HYPERPARAMS = {
        'epochs': 50,
        'batch_size': 32,
        'lr': 0.001,
        'optimizer': 'Adam',      # 仅支持 Adam, SGD, AdamW
    }

    OPTIMIZER_MAP = {
        'Adam': 'torch.optim.Adam',
        'SGD': 'torch.optim.SGD',
        'AdamW': 'torch.optim.AdamW',
    }

    def __init__(self,
                 model_class_name: str = "Model",
                 hyperparameters: Optional[Dict[str, Any]] = None,
                 dataset_config: Optional[Dict[str, Any]] = None):
        """
        :param model_class_name: 模型类名（需从外部 model.py 导入）
        :param hyperparameters: 包含 epochs, batch_size, lr, optimizer 的字典
        :param dataset_config: 数据集配置，包含 data_root, num_classes
        """
        self.model_class_name = model_class_name
        self.hyperparams = {**self.DEFAULT_HYPERPARAMS, **(hyperparameters or {})}
        self.dataset_config = dataset_config or {
            'type': 'image',
            'data_root': './data',
            'num_classes': 4
        }
        self.num_classes = self.dataset_config.get('num_classes', 4)
        self.data_root = self.dataset_config.get('data_root', './data')

    def generate(self) -> str:
        """生成完整的训练脚本代码"""
        sections = []

        sections.append(self._generate_imports())
        sections.append(self._generate_hyperparams())
        sections.append(self._generate_data_loaders())
        sections.append(self._generate_model_instantiation())
        sections.append(self._generate_loss_optimizer_scheduler())
        sections.append(self._generate_train_validate_funcs())
        sections.append(self._generate_train_model_func())
        sections.append(self._generate_main_block())

        return "\n\n".join(sections)

    def _generate_imports(self) -> str:
        imports = [
            "import torch",
            "import torch.nn as nn",
            "import torch.optim as optim",
            "from torch.utils.data import DataLoader",
            "from torchvision import datasets, transforms",
            "import os",
            "import time",
            "import copy",
            "from typing import Dict, List, Tuple"
        ]
        # 导入外部模型
        imports.append(f"from model import {self.model_class_name}")
        return "\n".join(imports)

    def _generate_hyperparams(self) -> str:
        epochs = self.hyperparams['epochs']
        batch_size = self.hyperparams['batch_size']
        lr = self.hyperparams['lr']
        opt_name = self.hyperparams['optimizer']
        return f"""# ==================== 超参数配置 ====================
BATCH_SIZE = {batch_size}
EPOCHS = {epochs}
LEARNING_RATE = {lr}
NUM_CLASSES = {self.num_classes}
DATA_ROOT = "{self.data_root}"
MODEL_SAVE_PATH = "./best_model.pth"
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")
SEED = 42
torch.manual_seed(SEED)"""

    def _generate_data_loaders(self) -> str:
        # 仅使用 ToTensor，无任何数据增强或归一化
        return f"""# ==================== 数据加载（无预处理，仅转Tensor）====================
# 注意：如果你的数据集已经提供张量数据，可以移除 transforms 参数或替换为自定义 Dataset
# 此处仅做必要的 PIL → Tensor 转换，无任何数据增强或归一化
transform = transforms.Compose([
    transforms.ToTensor()   # 仅将 PIL 图像转为 [0,1] 的 Tensor
])

train_dataset = datasets.ImageFolder(os.path.join(DATA_ROOT, "train"), transform=transform)
val_dataset = datasets.ImageFolder(os.path.join(DATA_ROOT, "val"), transform=transform)

train_loader = DataLoader(train_dataset, batch_size=BATCH_SIZE, shuffle=True, num_workers=4)
val_loader = DataLoader(val_dataset, batch_size=BATCH_SIZE, shuffle=False, num_workers=4)

print(f"训练集样本数: {{len(train_dataset)}}")
print(f"验证集样本数: {{len(val_dataset)}}")
print(f"类别映射: {{train_dataset.classes}}")  # 应为 {self.num_classes} 个类别"""

    def _generate_model_instantiation(self) -> str:
        return f"""# ==================== 实例化模型 ====================
model = {self.model_class_name}(num_classes=NUM_CLASSES).to(DEVICE)"""

    def _generate_loss_optimizer_scheduler(self) -> str:
        opt_name = self.hyperparams['optimizer']
        # 根据优化器类型生成不同的参数配置
        if opt_name == 'SGD':
            opt_line = f"optimizer = optim.SGD(model.parameters(), lr=LEARNING_RATE, momentum=0.9, weight_decay=0)"
        elif opt_name == 'Adam':
            opt_line = f"optimizer = optim.Adam(model.parameters(), lr=LEARNING_RATE, betas=(0.9, 0.999), weight_decay=0)"
        elif opt_name == 'AdamW':
            opt_line = f"optimizer = optim.AdamW(model.parameters(), lr=LEARNING_RATE, betas=(0.9, 0.999), weight_decay=0)"
        else:
            # 默认 Adam
            opt_line = f"optimizer = optim.Adam(model.parameters(), lr=LEARNING_RATE, betas=(0.9, 0.999), weight_decay=0)"

        return f"""# ==================== 损失函数与优化器 ====================
criterion = nn.CrossEntropyLoss()
{opt_line}
scheduler = optim.lr_scheduler.StepLR(optimizer, step_size=7, gamma=0.1)"""

    def _generate_train_validate_funcs(self) -> str:
        return """# ==================== 训练与验证函数 ====================
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
    return epoch_loss, epoch_acc"""

    def _generate_train_model_func(self) -> str:
        return """# ==================== 主训练函数（返回耗时、损失率、验证准确率） ====================
def train_model(model, train_loader, val_loader, criterion, optimizer, scheduler,
                device, epochs, save_path):
    \"\"\"
    训练模型并返回训练历史与关键指标
    返回:
        history: dict, 包含 'time', 'train_loss', 'train_acc', 'val_loss', 'val_acc' 列表
        best_val_acc: float, 最佳验证准确率
        total_time: float, 总训练耗时（秒）
    \"\"\"
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

        if val_acc > best_val_acc:
            best_val_acc = val_acc
            best_model_wts = copy.deepcopy(model.state_dict())
            torch.save(best_model_wts, save_path)
            print(f"  -> 保存最佳模型 (Val Acc: {val_acc:.4f})")

    total_time = time.time() - total_start
    print(f"\\n训练完成！最佳验证准确率: {best_val_acc:.4f}，总耗时: {total_time:.2f}s")
    print(f"最佳模型已保存至: {save_path}")

    return history, best_val_acc, total_time"""

    def _generate_main_block(self) -> str:
        return """# ==================== 执行训练并获取指标 ====================
if __name__ == "__main__":
    history, best_acc, total_time = train_model(
        model, train_loader, val_loader, criterion, optimizer, scheduler,
        device=DEVICE, epochs=EPOCHS, save_path=MODEL_SAVE_PATH
    )

    # 打印部分历史数据
    print("\\n===== 训练历史摘要 =====")
    print(f"最终训练损失: {history['train_loss'][-1]:.4f}")
    print(f"最终验证准确率: {history['val_acc'][-1]:.4f}")
    print(f"最佳验证准确率: {best_acc:.4f}")
    print(f"总耗时: {total_time:.2f} 秒")"""

    def get_hyperparameter_schema(self) -> Dict[str, Any]:
        """返回超参数 schema，用于前端表单生成"""
        return {
            'epochs': {
                'type': 'integer',
                'default': 50,
                'min': 1,
                'max': 1000,
                'description': '训练轮数',
                'required': True
            },
            'batch_size': {
                'type': 'select',
                'options': [16, 32, 64, 128, 256],
                'default': 32,
                'description': '批次大小',
                'required': True
            },
            'lr': {
                'type': 'float',
                'default': 0.001,
                'min': 0.0001,
                'max': 0.1,
                'step': 0.0001,
                'description': '学习率',
                'required': True
            },
            'optimizer': {
                'type': 'select',
                'options': ['Adam', 'SGD', 'AdamW'],   # 仅保留三个优化器
                'default': 'Adam',
                'description': '优化器',
                'required': True
            }
        }


def generate_training_script(model_class_name: str,
                            hyperparameters: Optional[Dict] = None,
                            data_root: str = './data',
                            num_classes: int = 4) -> str:
    """
    便捷函数：生成训练脚本
    :param model_class_name: 模型类名（需在 model.py 中定义）
    :param hyperparameters: 超参数字典，可包含 epochs, batch_size, lr, optimizer
    :param data_root: 数据集根目录（应包含 train/ 和 val/ 子文件夹）
    :param num_classes: 类别数量
    """
    dataset_config = {
        'type': 'image',
        'data_root': data_root,
        'num_classes': num_classes
    }
    generator = TrainingCodeGenerator(
        model_class_name=model_class_name,
        hyperparameters=hyperparameters,
        dataset_config=dataset_config
    )
    return generator.generate()


# ==================== 示例用法 ====================
if __name__ == "__main__":
    # 定义4个超参数
    hyperparams = {
        'epochs': 100,
        'batch_size': 64,
        'lr': 0.0001,
        'optimizer': 'AdamW'
    }

    # 生成训练脚本代码（假设模型类名为 MyModel）
    script_code = generate_training_script(
        model_class_name="MyModel",
        hyperparameters=hyperparams,
        data_root="./data",
        num_classes=4
    )

    # 打印完整生成的脚本
    print("生成的完整训练脚本如下:\n")
    print(script_code)