#pragma once

#include "ir.h"
#include "mdlspec.h"

namespace vek {
    Graph mdlspec_to_ir(const ModelSpec& spec);  // 将模型规格转换为中间表示图并推导形状
}