#pragma once

#include "ir.h"

#include <map>
#include <string>
#include <variant>
#include <vector>

namespace vek {
    struct ModelSpecTensor {
        std::string name;
        std::vector<int> shape; // batch 维度在前，-1 表示未知
    };

    struct ModelSpecNode {
        std::string id; // 调用方定义的唯一标识
        std::string type; // 层类型，与 Vek 层类型对应
        std::map<std::string, ParamValue> params;
        std::vector<std::string> inputs; // 引用 ModelSpecTensor::name 或 ModelSpecNode::id
        std::vector<std::string> outputs; // 输出名称，为空时自动生成
    };

    struct ModelSpec {
        std::string name;
        std::vector<ModelSpecTensor> inputs;
        std::vector<ModelSpecTensor> outputs;
        std::vector<ModelSpecNode> nodes;
    };
}