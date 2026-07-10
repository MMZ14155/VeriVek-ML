#pragma once

#include "mdlspec.h"

#include <string>

namespace vek {
    // 预留接口，未实现
    ModelSpec vek_to_mdlspec(const std::string& vek_text);  // 将 Vek 源代码解析为模型规格（用于 UI 反渲染）
}