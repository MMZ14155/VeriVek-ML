#pragma once

#include "ir.h"
#include "parser.h"

#include <map>
#include <string>

namespace vek {
    Graph build_ir(const AstProgram& program, const std::string& target_name = ""); // 从解析后的 AST 构建 Graph；target_name 为空时选择第一个 network
}