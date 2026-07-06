import os
import sys
import subprocess
from pathlib import Path

def create_task_environment(venv_path="C:/VeriVek/TaskEnv/venv"):
    venv = Path(venv_path)
    base_path = venv.parent

    # 创建基础文件夹
    print(f"创建文件夹: {base_path}")
    base_path.mkdir(parents=True, exist_ok=True)

    # 创建虚拟环境
    if venv.exists():
        print(f"虚拟环境已存在: {venv}")
    else:
        print(f"创建 Python 虚拟环境: {venv}")
        try:
            subprocess.run(
                [sys.executable, "-m", "venv", str(venv)],
                check=True,
                capture_output=True,
                text=True
            )
            print("✓ 虚拟环境创建成功")
        except subprocess.CalledProcessError as e:
            print(f"✗ 虚拟环境创建失败: {e}")
            return False

    # 显示激活命令
    print("\n" + "=" * 50)
    print("环境准备完成！")
    print(f"路径: {base_path}")
    print("\n激活虚拟环境:")
    print(f"  Windows CMD:    {venv}\\Scripts\\activate.bat")
    print(f"  Windows PowerShell: {venv}\\Scripts\\Activate.ps1")
    print("=" * 50)

    return True

def install_pytorch(venv_path="C:/VeriVek/TaskEnv/venv"):
    venv = Path(venv_path)

    # 根据操作系统确定 pip 路径
    if os.name == 'nt':  # Windows
        pip_executable = venv / "Scripts" / "pip.exe"
    else:  # Linux/Mac
        pip_executable = venv / "bin" / "pip"

    if not pip_executable.exists():
        print(f"✗ 找不到 pip: {pip_executable}")
        print("请先创建虚拟环境")
        return False

    print(f"\n开始安装 PyTorch (CUDA 11.8)...")
    print(f"使用 pip: {pip_executable}")

    try:
        subprocess.run(
            [
                str(pip_executable),
                "install",
                "torch==2.7.1",
                "torchvision==0.22.1",
                "torchaudio==2.7.1",
                "--index-url",
                "https://download.pytorch.org/whl/cu118"
            ],
            check=True
        )
        print("✓ PyTorch 安装成功")
        return True
    except subprocess.CalledProcessError as e:
        print(f"✗ PyTorch 安装失败: {e}")
        return False

if __name__ == "__main__":
    # 创建环境
    if create_task_environment():
        # 安装 PyTorch
        install_pytorch()