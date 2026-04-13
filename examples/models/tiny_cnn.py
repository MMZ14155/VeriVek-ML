import torch
import torch.nn as nn
import torch.nn.functional as F

class TinyCNN(nn.Module):
    def __init__(self, num_classes=10, input_channels=1):
        super(TinyCNN, self).__init__()
        # 卷积层: 1/3 -> 8 通道
        self.conv1 = nn.Conv2d(input_channels, 8, kernel_size=3, padding=1)
        # 卷积层: 8 -> 16 通道
        self.conv2 = nn.Conv2d(8, 16, kernel_size=3, padding=1)
        # 批归一化
        self.bn1 = nn.BatchNorm2d(8)
        self.bn2 = nn.BatchNorm2d(16)
        # Dropout
        self.dropout = nn.Dropout(0.25)
        # 全连接层
        self.fc1 = nn.Linear(16 * 7 * 7, 32)
        self.fc2 = nn.Linear(32, num_classes)

    def forward(self, x):
        # Conv1 + ReLU + MaxPool: 28x28 -> 14x14
        x = F.relu(self.bn1(self.conv1(x)))
        x = F.max_pool2d(x, 2)
        # Conv2 + ReLU + MaxPool: 14x14 -> 7x7
        x = F.relu(self.bn2(self.conv2(x)))
        x = F.max_pool2d(x, 2)
        # Flatten
        x = x.view(x.size(0), -1)
        # Dropout
        x = self.dropout(x)
        # FC1 + ReLU
        x = F.relu(self.fc1(x))
        # FC2 (输出)
        x = self.fc2(x)
        return x

def create_tiny_cnn(num_classes=10, input_channels=1):
    """创建 TinyCNN 模型的工厂函数"""
    return TinyCNN(num_classes=num_classes, input_channels=input_channels)

def count_parameters(model):
    """统计模型参数量"""
    return sum(p.numel() for p in model.parameters() if p.requires_grad)

if __name__ == "__main__":
    # 测试模型
    model = create_tiny_cnn(num_classes=10, input_channels=1)
    print(f"模型结构:\n{model}")
    print(f"\n总参数量: {count_parameters(model):,}")

    # 测试前向传播 (MNIST 格式: batch=4, channel=1, 28x28)
    test_input = torch.randn(4, 1, 28, 28)
    output = model(test_input)
    print(f"\n输入形状: {test_input.shape}")
    print(f"输出形状: {output.shape}")
    print(f"输出示例:\n{output[0]}")