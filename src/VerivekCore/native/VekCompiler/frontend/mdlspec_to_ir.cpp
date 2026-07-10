#include "mdlspec_to_ir.h"

#include "ir_optimize.h"
#include "shape.h"

#include <algorithm>
#include <map>
#include <queue>
#include <stdexcept>
#include <vector>

namespace vek {

    namespace {
        // 计算每个节点的入度，用于拓扑排序
        std::map<std::string, int> compute_indegrees(const ModelSpec& spec) {
            std::map<std::string, int> indegree;
            for (const auto& node : spec.nodes) {
                indegree[node.id] = 0;
            }
            for (const auto& node : spec.nodes) {
                for (const auto& input : node.inputs) {
                    if (indegree.count(input)) {
                        ++indegree[node.id];
                    }
                }
            }
            return indegree;
        }

        std::vector<std::string> topological_order(const ModelSpec& spec) {
            std::map<std::string, int> indegree = compute_indegrees(spec);
            std::queue<std::string> q;
            for (const auto& node : spec.nodes) {
                if (indegree[node.id] == 0) {
                    q.push(node.id);
                }
            }

            std::vector<std::string> order;
            while (!q.empty()) {
                std::string id = q.front();
                q.pop();
                order.push_back(id);

                for (const auto& node : spec.nodes) {
                    for (const auto& input : node.inputs) {
                        if (input == id) {
                            if (--indegree[node.id] == 0) {
                                q.push(node.id);
                            }
                        }
                    }
                }
            }

            if (order.size() != spec.nodes.size()) {
                throw std::runtime_error("cycle detected in model spec graph");
            }
            return order;
        }
    }

    Graph mdlspec_to_ir(const ModelSpec& spec) {
        Graph graph;
        graph.name = spec.name.empty() ? "Model" : spec.name;

        std::map<std::string, int> tensor_id_map;

        // 创建输入张量
        for (const auto& in : spec.inputs) {
            int id = graph.add_tensor("n" + in.name, in.shape);
            tensor_id_map[in.name] = id;
            if (graph.input_tensor < 0) {
                graph.input_tensor = id;
            }
        }

        // 预处理：建立节点 id 到节点索引的映射，以及输出节点的前驱映射
        std::map<std::string, size_t> node_index_map;
        std::map<std::string, std::string> output_predecessor;
        for (size_t i = 0; i < spec.nodes.size(); ++i) {
            node_index_map[spec.nodes[i].id] = i;
        }
        for (const auto& node : spec.nodes) {
            if (node.type == "Output") {
                if (!node.inputs.empty()) {
                    output_predecessor[node.id] = node.inputs[0];
                }
            }
        }

        std::vector<std::string> order = topological_order(spec);

        for (const std::string& node_id : order) {
            auto it = node_index_map.find(node_id);
            if (it == node_index_map.end()) continue;
            const ModelSpecNode& node = spec.nodes[it->second];

            if (node.type == "input") {
                continue;
            }
            if (node.type == "Output") {
                continue;
            }

            std::vector<int> input_ids;
            for (const auto& in : node.inputs) {
                auto map_it = tensor_id_map.find(in);
                if (map_it == tensor_id_map.end()) {
                    throw std::runtime_error("undefined input: " + in);
                }
                input_ids.push_back(map_it->second);
            }

            int output_tensor_id = graph.add_tensor("n" + node.id, {});
            tensor_id_map[node.id] = output_tensor_id;

            graph.add_node(node.type, node.params, input_ids, {output_tensor_id});
        }

        // 设置输出张量
        for (const auto& out : spec.outputs) {
            auto pred_it = output_predecessor.find(out.name);
            if (pred_it != output_predecessor.end()) {
                auto tensor_it = tensor_id_map.find(pred_it->second);
                if (tensor_it != tensor_id_map.end()) {
                    graph.output_tensors.push_back(tensor_it->second);
                }
            } else {
                auto tensor_it = tensor_id_map.find(out.name);
                if (tensor_it != tensor_id_map.end()) {
                    graph.output_tensors.push_back(tensor_it->second);
                }
            }
        }

        if (!propagate_shapes(graph)) {
            throw std::runtime_error("shape propagation failed");
        }

        optimize_ir(graph);

        return graph;
    }
}