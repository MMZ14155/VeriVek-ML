import subprocess

def get_gpu_info():
    try:
        cmd = [
            "nvidia-smi",
            "--query-gpu=index,name,memory.total,memory.used,memory.free",
            "--format=csv,noheader,nounits"
        ]
        output = subprocess.check_output(cmd, universal_newlines=True)
        lines = output.strip().split('\n')
        gpus = []
        for line in lines:
            if not line.strip():
                continue
            parts = line.split(', ')
            if len(parts) != 5:
                continue
            idx, name, mem_total, mem_used, mem_free = parts
            gpus.append({
                'index': int(idx),
                'name': name.strip(),
                'memory.total': mem_total.strip(),
                'memory.used': mem_used.strip(),
                'memory.free': mem_free.strip()
            })
        return gpus
    except (subprocess.CalledProcessError, FileNotFoundError, Exception):
        return []

def get_total_usage():
    gpus = get_gpu_info()
    if not gpus:
        return 0, 0

    total_mem = 0
    used_mem = 0
    for gpu in gpus:
        total_mem += int(gpu['memory.total'])
        used_mem += int(gpu['memory.used'])
    return used_mem, total_mem

if __name__ == "__main__":
    # 示例：打印所有 GPU 的详细信息
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

    # 示例：打印所有 GPU 的总显存和总占用
    total, used = get_total_usage()
    print(f"\n所有 GPU 显存总和: {total} MB")
    print(f"所有 GPU 已用显存总和: {used} MB")