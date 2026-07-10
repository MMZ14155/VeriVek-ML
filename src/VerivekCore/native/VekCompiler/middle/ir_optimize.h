#pragma once

#include "ir.h"

namespace vek {
    void optimize_ir(Graph& graph); // 对 IR 图进行变量复用优化。
}