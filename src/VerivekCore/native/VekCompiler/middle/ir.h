#pragma once

#include <map>
#include <memory>
#include <string>
#include <variant>
#include <vector>

namespace vek {
    using ParamValue = std::variant<int, double, bool, std::string, std::vector<int>>;

    struct Tensor {
        int id = -1;
        std::string name;
        std::vector<int> shape; // batch 维度在前，-1 表示未知
    };

    struct Node {
        int id = -1;
        std::string type; // 层类型字符串
        std::map<std::string, ParamValue> params; // 解析后的参数
        std::vector<int> inputs; // 输入张量 id 列表
        std::vector<int> outputs; // 输出张量 id 列表
    };

    struct Graph {
        std::string name;
        std::vector<Tensor> tensors;
        std::vector<Node> nodes;
        int input_tensor = -1;
        std::vector<int> output_tensors;
        std::map<int, std::string> node_groups; // 节点 id → 最外层分组名，用于生成 nn.Sequential 子模块
        std::map<int, int> tensor_slot; // 张量 id → 变量槽位编号的静态全量映射（0 为图输入变量），由 compute_var_slots 分配，backend 查表命名

        int add_tensor(
            const std::string& name,
            const std::vector<int>& shape = {}
        );
        int add_node(
            const std::string& type,
            const std::map<std::string, ParamValue>& params,
            const std::vector<int>& inputs,
            const std::vector<int>& outputs
        );
    };
}