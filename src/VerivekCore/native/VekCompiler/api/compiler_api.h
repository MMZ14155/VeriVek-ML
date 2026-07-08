#pragma once

#ifdef _WIN32
    #define VEK_API __declspec(dllexport)
#else
    #define VEK_API __attribute__((visibility("default")))
#endif

#ifdef __cplusplus
extern "C" {
#endif

VEK_API const char* vek_compile(const char* vek_source, const char* target); // 将 .vek 源代码编译为指定目标框架的代码。target 目前为 "pytorch" 或 "tensorflow"（不区分大小写）。返回 UTF-8 字符串，失败返回 NULL。
VEK_API const char* vek_graph_to_vek(const char* graph_json); // 将前端 JSON 图转换为 Vek 源代码。返回 UTF-8 字符串，失败返回 NULL。
VEK_API const char* vek_get_last_error(void); // 获取最近一次错误信息；无错误返回空字符串。

#ifdef __cplusplus
}
#endif