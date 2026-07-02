import ctypes
import json
import os

DLL_PATH = os.path.join(os.path.dirname(__file__), "hardware_monitor.dll")

def _get_lib():
    return ctypes.CDLL(DLL_PATH, winmode=0)

def get_gpu_info():
    try:
        lib = _get_lib()
        lib.hm_get_gpu_info.restype = ctypes.c_int
        buffer = ctypes.create_string_buffer(4096)
        required = lib.hm_get_gpu_info(buffer, ctypes.sizeof(buffer))
        if required > ctypes.sizeof(buffer):
            buffer = ctypes.create_string_buffer(required)
            lib.hm_get_gpu_info(buffer, ctypes.sizeof(buffer))
        text = buffer.value.decode("utf-8")
        gpus = json.loads(text)
        return [
            {
                'index': gpu['index'],
                'name': gpu['name'],
                'memory.total': gpu['memory_total'],
                'memory.used': gpu['memory_used'],
                'memory.free': gpu['memory_free'],
            }
            for gpu in gpus
        ]
    except Exception:
        return []

def get_total_usage():
    try:
        lib = _get_lib()
        used = ctypes.c_int()
        total = ctypes.c_int()
        lib.hm_get_total_usage(ctypes.byref(used), ctypes.byref(total))
        return used.value, total.value
    except Exception:
        return 0, 0

def get_ac_status():
    try:
        lib = _get_lib()
        lib.hm_get_ac_status.restype = ctypes.c_int
        result = lib.hm_get_ac_status()
        if result == -1:
            return None
        return result == 1
    except Exception:
        return None

if __name__ == "__main__":
    # 所有 GPU 的详细信息
    gpus = get_gpu_info()
    if gpus:
        print("NVIDIA GPU 信息：")
        for gpu in gpus:
            print(f"  GPU {gpu['index']}: {gpu['name']}")
            print(f"    显存总量: {gpu['memory.total']} MB")
            print(f"    已用显存: {gpu['memory.used']} MB")
            print(f"    空闲显存: {gpu['memory.free']} MB")
    else:
        print("未找到 NVIDIA GPU 或 nvidia-smi 不可用。")

    # 所有 GPU 的总显存和总占用
    total, used = get_total_usage()
    print(f"\n所有 NVIDIA GPU 显存总和: {total} MB")
    print(f"所有 NVIDIA GPU 已用显存总和: {used} MB")

    # 电源连接状态
    status = get_ac_status()
    print(f"\n电源连接状态: {status}")