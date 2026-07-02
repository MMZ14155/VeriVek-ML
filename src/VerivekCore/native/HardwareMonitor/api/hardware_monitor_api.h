#pragma once

#ifdef __cplusplus
extern "C" {
#endif

int hm_get_cuda_version(char* buffer, int buffer_size); // 获取 CUDA 运行时版本。返回字符串长度（不含终止符），失败返回 -1。
int hm_get_driver_version(char* buffer, int buffer_size); // 获取驱动版本（所有显卡中最低版本）。返回字符串长度（不含终止符），失败返回 -1。

int hm_get_gpu_info(char* buffer, int buffer_size); // 获取 GPU 信息，输出为 JSON 字符串。若 buffer_size 足够返回 0，不足返回需要的字节数（含终止符），失败返回 -1。
void hm_get_total_usage(int* used_mem, int* total_mem); // 获取所有 NVIDIA GPU 的总已用显存和总显存（单位 MB）。
int hm_get_gpu_utilization(double* out_utilization); // 获取整体 GPU 利用率（按显存加权）。返回 0 表示成功，结果写入 out_utilization；失败返回 -1。

#ifdef __cplusplus
}
#endif