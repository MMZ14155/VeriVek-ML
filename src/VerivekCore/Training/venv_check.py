import os
import subprocess
from pathlib import Path


def get_venv_python(venv_path: str) -> str:
    """返回指定虚拟环境的 Python 可执行文件路径。"""
    venv = Path(venv_path)
    if os.name == 'nt':
        python_executable = venv / "Scripts" / "python.exe"
    else:
        python_executable = venv / "bin" / "python"
    return str(python_executable)


def check_pytorch_in_venv(venv_path: str) -> dict:
    """
    检测指定虚拟环境中是否安装了 PyTorch，并返回版本与 CUDA 状态。

    返回：
        {
            'version': str | None,       # 已安装时返回版本号，否则为 None
            'cuda_available': bool | None,
            'error': str | None
        }
    """
    python_executable = get_venv_python(venv_path)
    error = None

    if not os.path.exists(python_executable):
        return {
            'version': None,
            'cuda_available': None,
            'error': f'虚拟环境不存在或未找到 Python 解释器: {python_executable}'
        }

    try:
        result = subprocess.run(
            [python_executable, "-c",
             "import torch; print(torch.__version__); print(torch.cuda.is_available())"],
            capture_output=True,
            text=True,
            timeout=30
        )
        if result.returncode != 0:
            return {
                'version': None,
                'cuda_available': None,
                'error': result.stderr.strip() or 'PyTorch 检测失败'
            }

        lines = result.stdout.strip().splitlines()
        version = lines[0] if lines else None
        cuda_available = lines[1].lower() == 'true' if len(lines) > 1 else None

    except subprocess.TimeoutExpired:
        version = None
        cuda_available = None
        error = 'PyTorch 检测超时'
    except Exception as e:
        version = None
        cuda_available = None
        error = str(e)

    return {
        'version': version,
        'cuda_available': cuda_available,
        'error': error
    }


if __name__ == '__main__':
    import json

    TASK_ENV_VENV = "C:/VeriVek/TaskEnv/venv"
    print(f"正在检测 TaskEnv 虚拟环境: {TASK_ENV_VENV}")
    print(json.dumps(check_pytorch_in_venv(TASK_ENV_VENV), indent=2, ensure_ascii=False))