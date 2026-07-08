#include "tensorflow.h"

#include <stdexcept>

namespace vek {
    std::string generate_tensorflow(const Graph&) {
        // 占位：TensorFlow / Keras 代码生成尚未实现。
        throw std::runtime_error("TensorFlow backend is not yet implemented");
    }
}