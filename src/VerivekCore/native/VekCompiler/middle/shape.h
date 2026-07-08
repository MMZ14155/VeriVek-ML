#pragma once

#include "ir.h"

#include <vector>

namespace vek {
    std::vector<int> infer_output_shape(const Node& node, const std::vector<const Tensor*>& inputs); // 根据输入张量形状推断节点输出形状；失败或不支持时返回空
    void infer_node_params(Node& node, const std::vector<const Tensor*>& inputs); // 推断缺失参数，如 conv2d 的 in_channels 和 dense 的 in_features
    bool propagate_shapes(Graph& graph); // 对整张图进行形状前向传播
}