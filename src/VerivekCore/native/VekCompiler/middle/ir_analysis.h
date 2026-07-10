#pragma once

#include "ir.h"
#include <string>

namespace vek {
    std::string analyze_params_to_json(const Graph& graph); // 分析 IR 图的逐节点参数量，返回 JSON 字符串。
}