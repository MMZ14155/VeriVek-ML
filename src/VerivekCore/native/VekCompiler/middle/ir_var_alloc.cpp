#include "ir_var_alloc.h"

#include <map>
#include <set>

namespace vek {
    void compute_var_slots(Graph& graph) {
        graph.tensor_slot.clear();

        // 张量 id → 最后一次使用它的节点下标，图输出钉在 return 处
        std::map<int, int> last_use;
        for (size_t i = 0; i < graph.nodes.size(); ++i) {
            for (int in_id : graph.nodes[i].inputs) {
                last_use[in_id] = static_cast<int>(i); // 节点按拓扑序排列，后者覆盖前者
            }
        }
        for (int out_id : graph.output_tensors) {
            last_use[out_id] = static_cast<int>(graph.nodes.size());
        }

        // 活跃槽位表，仅 pass 内部用于回收判断，tensor_slot 为静态全量映射，不做 erase
        std::map<int, int> live; // 张量 id → 槽位编号
        std::set<int> free_slots; // 有序，总是优先复用最小编号
        int next_slot = 1;

        if (graph.input_tensor >= 0) {
            graph.tensor_slot[graph.input_tensor] = 0; // 图输入固定占用槽位 0
            live[graph.input_tensor] = 0;
        }

        // 回收 last_use <= 当前节点下标的活跃槽位，目标语言先完整求值 RHS 再绑定 LHS，因此本节点的输出槽位可以立即复用任一"随本节点消亡"的输入槽位
        auto release_dead = [&](int node_index) {
            for (auto it = live.begin(); it != live.end();) {
                auto lu = last_use.find(it->first);
                if (lu == last_use.end() || lu->second <= node_index) {
                    free_slots.insert(it->second);
                    it = live.erase(it);
                } else {
                    ++it;
                }
            }
        };

        for (size_t i = 0; i < graph.nodes.size(); ++i) {
            const Node& node = graph.nodes[i];
            if (node.outputs.empty()) continue;

            int out_id = node.outputs[0];
            // 已持有槽位的张量（被前序节点复用为输出）直接沿用，不再重复分配
            if (graph.tensor_slot.count(out_id)) continue;

            release_dead(static_cast<int>(i));

            if (last_use.find(out_id) == last_use.end()) continue; // 死输出：不分配槽位

            int slot;
            if (!free_slots.empty()) {
                slot = *free_slots.begin();
                free_slots.erase(free_slots.begin());
            } else {
                slot = next_slot++;
            }
            graph.tensor_slot[out_id] = slot;
            live[out_id] = slot;
        }
    }
}
