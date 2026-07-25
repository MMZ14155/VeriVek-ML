#pragma once

#include "ir.h"

namespace vek {
    // 活性分析 + 槽位池分配变量槽位，结果写入 graph.tensor_slot（静态映射，只增不删），backend 查表命名。
    void compute_var_slots(Graph& graph);
}
