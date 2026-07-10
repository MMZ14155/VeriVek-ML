#pragma once

#ifdef _WIN32
    #define VEK_API __declspec(dllexport)
#else
    #define VEK_API __attribute__((visibility("default")))
#endif

#ifdef __cplusplus
extern "C" { 
#endif
    VEK_API const char* vk_compile_vek(const char* vek_source, const char* target); // 将 .vek 源代码编译为指定目标框架的代码，target 目前为 "pytorch" 或 "tensorflow"（不区分大小写），返回 UTF-8 字符串，失败返回 NULL
    VEK_API const char* vk_compile_graph(const char* graph_json, const char* target); // 将前端 JSON 图直接编译为指定目标框架的代码，返回 UTF-8 字符串，失败返回 NULL
    VEK_API const char* vk_analyze_params(const char* graph_json); // 分析前端 JSON 图的逐节点参数量，返回 JSON 字符串
    VEK_API const char* vk_get_last_error(void); // 获取最近一次错误信息，无错误返回空字符串
#ifdef __cplusplus
}
#endif