#pragma once

#include "mdlspec.h"

#include <string>

namespace vek {
    ModelSpec json_to_mdlspec(const std::string& json); // 将前端 JSON 模型规格解析为 ModelSpec
}