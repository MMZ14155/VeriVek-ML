#pragma once

#include "fgraph_input.h"

#include <string>

namespace vek {
    // 预留接口，未实现
    FrontendGraph vek_to_frontend_graph(const std::string& vek_text);  // 将 Vek 源代码解析为前端图（用于 UI 反渲染）
}