#include "ir_optimize.h"

#include <algorithm>
#include <map>
#include <vector>

namespace vek {
    namespace {
        // 统计每个张量被作为输入使用的节点列表
        std::map<int, std::vector<int>> compute_tensor_uses(const Graph& graph) {
            std::map<int, std::vector<int>> uses;
            for (int i = 0; i < static_cast<int>(graph.nodes.size()); ++i) {
                for (int tid : graph.nodes[i].inputs) {
                    uses[tid].push_back(i);
                }
            }
            return uses;
        }

        // 判断节点是否可以原地复用输入变量
        bool can_reuse_inplace(const Node& node) {
            if (node.inputs.size() != 1) return false;
            if (node.outputs.size() != 1) return false;

            const std::string& t = node.type;
            if (t == "input" || t == "Output") return false;
            // 多输入或具有副作用的层（如 add/concat）不做复用
            if (t == "add" || t == "concat" || t == "mul" || t == "sub") return false;
            return true;
        }
    }

    void optimize_ir(Graph& graph) {
        auto uses = compute_tensor_uses(graph);
        std::map<int, int> remaining;
        for (const auto& [tid, user_list] : uses) {
            remaining[tid] = static_cast<int>(user_list.size());
        }

        std::map<int, int> remap;
        auto resolve = [&remap](int tid) {
            while (remap.count(tid)) {
                tid = remap[tid];
            }
            return tid;
        };

        for (Node& node : graph.nodes) {
            // 解析输入并递减使用计数
            for (int& in : node.inputs) {
                in = resolve(in);
                --remaining[in];
            }

            if (!can_reuse_inplace(node)) continue;
            if (node.outputs.empty()) continue;

            int in_tid = node.inputs[0];
            int out_tid = resolve(node.outputs[0]);

            // 保留图输入变量名语义，避免把输出重写回输入名
            if (in_tid == graph.input_tensor) continue;

            // 只有输入张量在此节点之后不再被使用，才可复用其变量名
            auto it = remaining.find(in_tid);
            if (it == remaining.end() || it->second != 0) continue;

            // 合并输出到输入变量
            remap[out_tid] = in_tid;
            node.outputs[0] = in_tid;

            // 原 out_tid 的后续使用者现在使用 in_tid，需要转移剩余计数
            auto it_out = remaining.find(out_tid);
            if (it_out != remaining.end()) {
                remaining[in_tid] += it_out->second;
                remaining.erase(it_out);
            }
        }

        // 统一更新所有节点的输出和图输出
        for (Node& node : graph.nodes) {
            for (int& out : node.outputs) {
                out = resolve(out);
            }
        }
        for (int& tid : graph.output_tensors) {
            tid = resolve(tid);
        }
    }
}