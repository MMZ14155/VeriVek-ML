#include "fgraph_to_vek.h"

#include <map>
#include <sstream>

namespace vek {
    namespace {
        std::string make_var(const std::string& id) {
            return "n" + id;
        }

        std::string frontend_graph_to_vek_impl(const FrontendGraph& graph) {
            std::map<std::string, std::string> output_map;
            std::ostringstream oss;
            oss << "network " << graph.name << " {\n";

            for (const auto& in : graph.inputs) {
                oss << "    input " << make_var(in.name) << " = (";
                for (size_t i = 0; i < in.shape.size(); ++i) {
                    if (i > 0) oss << ", ";
                    oss << in.shape[i];
                }
                oss << ")\n";
            }

            for (const auto& node : graph.nodes) {
                if (node.type == "input") {
                    continue;
                }

                if (node.type == "Output") {
                    if (!node.inputs.empty()) {
                        output_map[node.id] = node.inputs[0];
                    }
                    continue;
                }

                oss << "    " << make_var(node.id) << " = ";
                oss << node.type;

                if (!node.params.empty()) {
                    oss << "(";
                    size_t count = 0;
                    for (const auto& [key, value] : node.params) {
                        if (count > 0) oss << ", ";
                        if (!key.empty()) oss << key << "=";
                        std::visit([&oss](const auto& v) {
                            using T = std::decay_t<decltype(v)>;
                            if constexpr (std::is_same_v<T, std::string>) {
                                oss << "\"" << v << "\"";
                            } else if constexpr (std::is_same_v<T, std::vector<int>>) {
                                oss << "(";
                                for (size_t i = 0; i < v.size(); ++i) {
                                    if (i > 0) oss << ", ";
                                    oss << v[i];
                                }
                                oss << ")";
                            } else {
                                oss << v;
                            }
                        }, value);
                        ++count;
                    }
                    oss << ")";
                }

                if (!node.inputs.empty()) {
                    oss << "(";
                    for (size_t i = 0; i < node.inputs.size(); ++i) {
                        if (i > 0) oss << ", ";
                        oss << make_var(node.inputs[i]);
                    }
                    oss << ")";
                }

                oss << "\n";
            }

            if (!graph.outputs.empty()) {
                oss << "    return ";
                for (size_t i = 0; i < graph.outputs.size(); ++i) {
                    if (i > 0) oss << ", ";
                    const std::string& name = graph.outputs[i].name;
                    auto it = output_map.find(name);
                    if (it != output_map.end()) {
                        oss << make_var(it->second);
                    } else {
                        oss << make_var(name);
                    }
                }
                oss << "\n";
            }

            oss << "}\n";
            return oss.str();
        }
    }

    std::string frontend_graph_to_vek(const FrontendGraph& graph) {
        return frontend_graph_to_vek_impl(graph);
    }
}