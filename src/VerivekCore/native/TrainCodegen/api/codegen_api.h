#pragma once

#ifdef _WIN32
    #define TC_API __declspec(dllexport)
#endif

#ifdef __cplusplus
extern "C" {
#endif
    TC_API const char* tc_generate_training_script(const char* config_json); // 根据 JSON 配置（model_class_name/hyperparameters/data_root/num_classes，均可选）生成完整训练脚本，返回 UTF-8 字符串，失败返回 NULL
    TC_API const char* tc_get_hyperparameter_schema(void); // 返回超参数 schema 的 JSON 字符串，用于前端表单生成
    TC_API const char* tc_get_last_error(void); // 获取最近一次错误信息，无错误返回空字符串
#ifdef __cplusplus
}
#endif