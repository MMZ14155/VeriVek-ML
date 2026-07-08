#pragma once

#include "fgraph_input.h"

#include <string>

namespace vek {
    std::string frontend_graph_to_vek(const FrontendGraph& graph); // 将前端图序列化为 Vek 源代码
}