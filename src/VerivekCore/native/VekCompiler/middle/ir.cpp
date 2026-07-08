#include "ir.h"

namespace vek {
    int Graph::add_tensor(
        const std::string& name,
        const std::vector<int>& shape
    ) {
        Tensor t;
        t.id = static_cast<int>(tensors.size());
        t.name = name;
        t.shape = shape;
        tensors.push_back(std::move(t));
        return tensors.back().id;
    }

    int Graph::add_node(
        const std::string& type,
        const std::map<std::string, ParamValue>& params,
        const std::vector<int>& inputs,
        const std::vector<int>& outputs
    ) {
        Node n;
        n.id = static_cast<int>(nodes.size());
        n.type = type;
        n.params = params;
        n.inputs = inputs;
        n.outputs = outputs;
        nodes.push_back(std::move(n));
        return nodes.back().id;
    }
}