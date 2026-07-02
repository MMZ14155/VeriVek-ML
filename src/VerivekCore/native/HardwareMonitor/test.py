import ctypes
import json
import os

DLL_PATH = os.path.abspath(os.path.join(
    os.path.dirname(__file__), "build", "hardware_monitor.dll"
))

def get_cuda_version():
    lib = ctypes.CDLL(DLL_PATH, winmode=0)
    lib.hm_get_cuda_version.restype = ctypes.c_int
    buffer = ctypes.create_string_buffer(256)
    length = lib.hm_get_cuda_version(buffer, ctypes.sizeof(buffer))
    if length == -1:
        return None
    if length >= ctypes.sizeof(buffer):
        buffer = ctypes.create_string_buffer(length + 1)
        lib.hm_get_cuda_version(buffer, ctypes.sizeof(buffer))
    return buffer.value.decode("utf-8")

def get_driver_version():
    lib = ctypes.CDLL(DLL_PATH, winmode=0)
    lib.hm_get_driver_version.restype = ctypes.c_int
    buffer = ctypes.create_string_buffer(256)
    length = lib.hm_get_driver_version(buffer, ctypes.sizeof(buffer))
    if length == -1:
        return None
    if length >= ctypes.sizeof(buffer):
        buffer = ctypes.create_string_buffer(length + 1)
        lib.hm_get_driver_version(buffer, ctypes.sizeof(buffer))
    return buffer.value.decode("utf-8")

def get_gpu_info():
    lib = ctypes.CDLL(DLL_PATH, winmode=0)
    lib.hm_get_gpu_info.restype = ctypes.c_int
    buffer = ctypes.create_string_buffer(4096)
    required = lib.hm_get_gpu_info(buffer, ctypes.sizeof(buffer))
    if required > ctypes.sizeof(buffer):
        buffer = ctypes.create_string_buffer(required)
        lib.hm_get_gpu_info(buffer, ctypes.sizeof(buffer))
    text = buffer.value.decode("utf-8")
    return json.loads(text)

def get_total_usage():
    lib = ctypes.CDLL(DLL_PATH, winmode=0)
    used = ctypes.c_int()
    total = ctypes.c_int()
    lib.hm_get_total_usage(ctypes.byref(used), ctypes.byref(total))
    return used.value, total.value

def get_gpu_utilization():
    lib = ctypes.CDLL(DLL_PATH, winmode=0)
    lib.hm_get_gpu_utilization.restype = ctypes.c_int
    out = ctypes.c_double()
    result = lib.hm_get_gpu_utilization(ctypes.byref(out))
    if result == -1:
        return None
    return out.value

def get_ac_status():
    lib = ctypes.CDLL(DLL_PATH, winmode=0)
    lib.hm_get_ac_status.restype = ctypes.c_int
    result = lib.hm_get_ac_status()
    if result == -1:
        return None
    return result == 1

if __name__ == "__main__":
    print("CUDA version:", get_cuda_version())
    print("Driver version:", get_driver_version())

    print("GPU info:", get_gpu_info())
    print("Total usage:", get_total_usage())
    print("GPU utilization:", get_gpu_utilization())
    
    print("AC status:", get_ac_status())