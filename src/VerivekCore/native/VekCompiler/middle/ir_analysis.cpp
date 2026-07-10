#include "ir_analysis.h"

#include <cmath>
#include <map>
#include <sstream>
#include <string>

namespace vek {

    namespace {
        int get_int_param(const Node& node, const std::string& key, int default_value) {
            auto it = node.params.find(key);
            if (it == node.params.end()) return default_value;
            if (std::holds_alternative<int>(it->second)) return std::get<int>(it->second);
            return default_value;
        }

        bool get_bool_param(const Node& node, const std::string& key, bool default_value) {
            auto it = node.params.find(key);
            if (it == node.params.end()) return default_value;
            if (std::holds_alternative<bool>(it->second)) return std::get<bool>(it->second);
            return default_value;
        }

        // 将字符串中的双引号转义为 JSON 字符串字面量
        std::string json_escape(const std::string& s) {
            std::ostringstream out;
            for (char c : s) {
                if (c == '"') out << "\\\"";
                else if (c == '\\') out << "\\\\";
                else if (c == '\b') out << "\\b";
                else if (c == '\f') out << "\\f";
                else if (c == '\n') out << "\\n";
                else if (c == '\r') out << "\\r";
                else if (c == '\t') out << "\\t";
                else out << c;
            }
            return out.str();
        }

        struct LayerParamResult {
            std::string name;
            std::string type;
            long long params = 0;
            std::string note;
            std::string calc;
        };

        LayerParamResult analyze_node(const Graph& graph, const Node& node) {
            LayerParamResult result;
            result.name = "n" + std::to_string(node.id);
            result.type = node.type;

            const std::string& t = node.type;

            if (t == "conv2d") {
                int in_ch = get_int_param(node, "in_channels", 1);
                int out_ch = get_int_param(node, "out_channels", 1);
                int k = get_int_param(node, "kernel_size", 1);
                bool bias = get_bool_param(node, "bias", true);
                long long weight = static_cast<long long>(out_ch) * in_ch * k * k;
                long long bias_params = bias ? out_ch : 0;
                result.params = weight + bias_params;
                result.calc = std::to_string(out_ch) + "×" + std::to_string(in_ch) +
                            "×" + std::to_string(k) + "×" + std::to_string(k) +
                            " + " + std::to_string(bias_params);
            } else if (t == "dense" || t == "linear") {
                int in_f = get_int_param(node, "in_features", 1);
                int out_f = get_int_param(node, "out_features", 1);
                bool bias = get_bool_param(node, "bias", true);
                long long weight = static_cast<long long>(in_f) * out_f;
                long long bias_params = bias ? out_f : 0;
                result.params = weight + bias_params;
                result.calc = std::to_string(in_f) + "×" + std::to_string(out_f) +
                            " + " + std::to_string(bias_params);
            } else if (t == "batchnorm2d") {
                int num_features = get_int_param(node, "num_features", 1);
                if (num_features == 1 && !node.inputs.empty() && node.inputs[0] >= 0) {
                    num_features = graph.tensors[node.inputs[0]].shape.empty() ? 1 : graph.tensors[node.inputs[0]].shape[0];
                }
                result.params = 2LL * num_features;
                result.calc = "2×" + std::to_string(num_features);
            } else if (t == "layernorm") {
                std::vector<int> normalized_shape;
                auto it = node.params.find("normalized_shape");
                if (it != node.params.end() && std::holds_alternative<std::vector<int>>(it->second)) {
                    normalized_shape = std::get<std::vector<int>>(it->second);
                }
                int num_features = 1;
                for (int d : normalized_shape) num_features *= d;
                bool elementwise_affine = get_bool_param(node, "elementwise_affine", true);
                result.params = elementwise_affine ? 2LL * num_features : 0;
                result.calc = elementwise_affine ? "2×" + std::to_string(num_features) : "0 (no affine)";
            } else if (t == "dropout" || t == "relu" || t == "tanh" || t == "sigmoid" ||
                    t == "gelu" || t == "leaky_relu" || t == "softmax" || t == "maxpool2d" ||
                    t == "avgpool2d" || t == "adaptive_avgpool2d" || t == "flatten" ||
                    t == "view" || t == "add" || t == "concat" || t == "input" || t == "Output") {
                result.params = 0;
                result.note = "No trainable parameters";
            } else if (t == "lstm" || t == "gru") {
                int input_size = 1;
                if (!node.inputs.empty() && node.inputs[0] >= 0) {
                    const std::vector<int>& sh = graph.tensors[node.inputs[0]].shape;
                    if (!sh.empty()) input_size = sh.back();
                }
                int hidden = get_int_param(node, "hidden_size", 1);
                int num_layers = get_int_param(node, "num_layers", 1);
                bool bidirectional = get_bool_param(node, "bidirectional", false);
                int num_dirs = bidirectional ? 2 : 1;
                int gates = (t == "lstm") ? 4 : 3;
                long long params_per_layer = static_cast<long long>(gates) *
                                            (static_cast<long long>(input_size) * hidden +
                                            static_cast<long long>(hidden) * hidden +
                                            2LL * hidden);
                result.params = static_cast<long long>(num_layers) * num_dirs * params_per_layer;
                result.calc = std::to_string(num_layers) + "×" + std::to_string(num_dirs) +
                            "×" + std::to_string(gates) + "×(" +
                            std::to_string(input_size) + "×" + std::to_string(hidden) + "+" +
                            std::to_string(hidden) + "×" + std::to_string(hidden) + "+2×" +
                            std::to_string(hidden) + ")";
            } else if (t == "embedding") {
                int num_embeddings = get_int_param(node, "num_embeddings", 1);
                int embedding_dim = get_int_param(node, "embedding_dim", 1);
                result.params = static_cast<long long>(num_embeddings) * embedding_dim;
                result.calc = std::to_string(num_embeddings) + "×" + std::to_string(embedding_dim);
            } else {
                result.params = 0;
                result.note = "Unknown layer type: " + t;
            }

            return result;
        }
    }

    std::string analyze_params_to_json(const Graph& graph) {
        std::ostringstream out;
        out << "{";

        long long total_params = 0;
        long long trainable_params = 0;

        out << "\"layer_details\":[";
        bool first = true;
        for (const Node& node : graph.nodes) {
            if (node.type == "input" || node.type == "Output") continue;

            LayerParamResult r = analyze_node(graph, node);
            total_params += r.params;
            trainable_params += r.params;

            if (!first) out << ",";
            first = false;

            out << "{";
            out << "\"name\":\"" << json_escape(r.name) << "\",";
            out << "\"type\":\"" << json_escape(r.type) << "\",";
            out << "\"params\":" << r.params << ",";
            out << "\"trainable\":" << (r.params > 0 ? "true" : "false") << ",";
            out << "\"calculation\":\"" << json_escape(r.calc) << "\",";
            out << "\"note\":\"" << json_escape(r.note) << "\"";
            out << "}";
        }
        out << "],";

        out << "\"total_params\":" << total_params << ",";
        out << "\"trainable_params\":" << trainable_params << ",";
        out << "\"total_size_mb_fp32\":" << (total_params * 4.0 / (1024.0 * 1024.0)) << ",";
        out << "\"total_size_mb_fp16\":" << (total_params * 2.0 / (1024.0 * 1024.0)) << "}";

        return out.str();
    }
}