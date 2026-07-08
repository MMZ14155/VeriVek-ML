#pragma once

#include "fgraph_input.h"

#include <string>

namespace vek {
    FrontendGraph json_to_frontend_graph(const std::string& json); // 将前端 JSON 图解析为 FrontendGraph
}