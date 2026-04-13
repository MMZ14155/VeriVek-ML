import os
import shutil
from PIL import Image
from pathlib import Path

def preprocess_image(image_path, output_path, size=(28, 28)):
    """
    预处理单张图片：转为灰度图并缩放到指定尺寸

    Args:
        image_path: 输入图片路径
        output_path: 输出图片路径
        size: 目标尺寸，默认 (28, 28)
    """
    # 打开图片
    with Image.open(image_path) as img:
        # 转为灰度图 (L 模式)
        img_gray = img.convert('L')
        # 缩放到目标尺寸
        img_resized = img_gray.resize(size, Image.Resampling.LANCZOS)
        # 保存结果
        img_resized.save(output_path)

def preprocess_dataset(input_dir=None, output_dir=None, size=(28, 28)):
    """
    批量预处理数据集文件夹中的所有图片
    支持子文件夹结构，保持目录层级关系

    Args:
        input_dir: 输入文件夹路径（包含子文件夹，子文件夹内是图像）
                 默认为None，从环境变量 PREPROCESS_INPUT_DIR 读取
        output_dir: 输出文件夹路径
                  默认为None，从环境变量 PREPROCESS_OUTPUT_DIR 读取
        size: 目标尺寸，默认 (28, 28)
    """
    # 优先从环境变量读取路径（用于TaskEnv环境）
    if input_dir is None:
        input_dir = os.environ.get('PREPROCESS_INPUT_DIR', './raw_images')
    if output_dir is None:
        output_dir = os.environ.get('PREPROCESS_OUTPUT_DIR', './processed')

    input_path = Path(input_dir)
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    print(f"[Preprocess] 输入目录: {input_path}")
    print(f"[Preprocess] 输出目录: {output_path}")

    # 支持的图片格式
    extensions = {'.jpg', '.jpeg', '.png', '.bmp', '.gif', '.tiff', '.webp'}

    processed_count = 0
    # 遍历子文件夹（类别文件夹）
    for category_dir in input_path.iterdir():
        if category_dir.is_dir():
            category_name = category_dir.name
            # 创建对应的输出子文件夹
            category_output_path = output_path / category_name
            category_output_path.mkdir(parents=True, exist_ok=True)

            # 处理该类别下的所有图片
            for img_file in category_dir.iterdir():
                if img_file.is_file() and img_file.suffix.lower() in extensions:
                    # 输出文件名保持相同，但统一转为 PNG 格式
                    output_file = category_output_path / f"{img_file.stem}.png"
                    try:
                        preprocess_image(img_file, output_file, size)
                        print(f"✓ 已处理: {category_name}/{img_file.name}")
                        processed_count += 1
                    except Exception as e:
                        print(f"✗ 处理失败: {category_name}/{img_file.name}, 错误: {e}")

    print(f"\n处理完成！共处理 {processed_count} 张图片")
    print(f"输出目录: {output_path}")

def split_to_train_val(processed_dir, output_dir):
    """
    将预处理后的数据复制到 train 和 val 文件夹
    为了演示效果，训练集和验证集内容相同

    Args:
        processed_dir: 预处理后数据的目录路径
        output_dir: 输出目录路径（将创建 train 和 val 子文件夹）
    """
    processed_path = Path(processed_dir)
    output_path = Path(output_dir)

    train_path = output_path / "train"
    val_path = output_path / "val"

    # 创建 train 和 val 文件夹
    train_path.mkdir(parents=True, exist_ok=True)
    val_path.mkdir(parents=True, exist_ok=True)

    copied_count = 0

    # 遍历预处理后的类别文件夹
    for category_dir in processed_path.iterdir():
        if category_dir.is_dir():
            category_name = category_dir.name

            # 创建 train 和 val 中的类别子文件夹
            train_category_path = train_path / category_name
            val_category_path = val_path / category_name
            train_category_path.mkdir(parents=True, exist_ok=True)
            val_category_path.mkdir(parents=True, exist_ok=True)

            # 复制文件到 train 和 val（内容相同）
            for img_file in category_dir.iterdir():
                if img_file.is_file():
                    try:
                        # 复制到 train
                        shutil.copy2(img_file, train_category_path / img_file.name)
                        # 复制到 val
                        shutil.copy2(img_file, val_category_path / img_file.name)
                        copied_count += 1
                        print(f"✓ 已复制到 train/val: {category_name}/{img_file.name}")
                    except Exception as e:
                        print(f"✗ 复制失败: {category_name}/{img_file.name}, 错误: {e}")

    print(f"\n数据集划分完成！")
    print(f"共复制 {copied_count} 张图片到 train 和 val（各 {copied_count} 张）")
    print(f"输出目录: {output_path}")

if __name__ == "__main__":
    # 优先从环境变量读取路径（用于TaskEnv环境）
    # PREPROCESS_INPUT_DIR: 输入数据目录
    # PREPROCESS_OUTPUT_DIR: 输出数据目录（直接保存到TaskEnv）
    input_directory = os.environ.get('PREPROCESS_INPUT_DIR', './raw_images')
    output_directory = os.environ.get('PREPROCESS_OUTPUT_DIR', './processed')

    print(f"[TaskEnv] 输入目录: {input_directory}")
    print(f"[TaskEnv] 输出目录: {output_directory}")
    print("=" * 50)

    # 执行预处理并直接输出到目标目录
    preprocess_dataset(input_directory, output_directory, size=(28, 28))

    print("\n" + "=" * 50)
    print("[TaskEnv] 预处理完成！数据已保存至:", output_directory)
