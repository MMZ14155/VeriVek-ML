#pragma once

#include "ir.h"

#include <string>

namespace vek {
    std::string generate_pytorch(const Graph& graph); // 从 Vek 图生成 PyTorch nn.Module 的 Python 代码
}