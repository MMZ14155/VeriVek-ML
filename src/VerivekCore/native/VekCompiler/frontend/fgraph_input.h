#pragma once

#include "ir.h"

#include <map>
#include <string>
#include <variant>
#include <vector>

namespace vek {
    struct FrontendTensor {
        std::string name;
        std::vector<int> shape; // batch 维度在前，-1 表示未知
    };

    struct FrontendNode {
        std::string id; // 调用方定义的唯一标识
        std::string type; // 层类型，与 Vek 层类型对应
        std::map<std::string, ParamValue> params;
        std::vector<std::string> inputs; // 引用 FrontendTensor::name 或 FrontendNode::id
        std::vector<std::string> outputs; // 输出名称，为空时自动生成
    };

    struct FrontendGraph {
        std::string name;
        std::vector<FrontendTensor> inputs;
        std::vector<FrontendTensor> outputs;
        std::vector<FrontendNode> nodes;
    };
}