#pragma once

#include "ir.h"

#include <string>

namespace vek {
    std::string generate_tensorflow(const Graph& graph); // 从 Vek 图生成 TensorFlow / Keras 的 Python 代码
}