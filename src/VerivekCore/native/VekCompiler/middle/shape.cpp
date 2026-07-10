#include "shape.h"

#include <algorithm>
#include <cmath>

namespace vek {
    namespace {
        int get_int_param(const Node& node, const std::string& key, int default_value);
        double get_double_param(const Node& node, const std::string& key, double default_value);
        std::string get_string_param(const Node& node, const std::string& key, const std::string& default_value);
        std::vector<int> view_output_shape(const std::vector<int>& input_shape, const Node& node);

        int get_int_param(const Node& node, const std::string& key, int default_value) {
            auto it = node.params.find(key);
            if (it == node.params.end()) return default_value;
            if (std::holds_alternative<int>(it->second)) return std::get<int>(it->second);
            return default_value;
        }

        double get_double_param(const Node& node, const std::string& key, double default_value) {
            auto it = node.params.find(key);
            if (it == node.params.end()) return default_value;
            if (std::holds_alternative<double>(it->second)) return std::get<double>(it->second);
            if (std::holds_alternative<int>(it->second)) return static_cast<double>(std::get<int>(it->second));
            return default_value;
        }

        std::string get_string_param(const Node& node, const std::string& key, const std::string& default_value) {
            auto it = node.params.find(key);
            if (it == node.params.end()) return default_value;
            if (std::holds_alternative<std::string>(it->second)) return std::get<std::string>(it->second);
            return default_value;
        }

        std::vector<int> conv2d_output_shape(const std::vector<int>& input_shape, const Node& node) {
            if (input_shape.size() < 2) return {};
            int h = input_shape[input_shape.size() - 2];
            int w = input_shape[input_shape.size() - 1];
            int out_channels = get_int_param(node, "out_channels", 0);
            int kernel = get_int_param(node, "kernel_size", 1);
            int stride = get_int_param(node, "stride", 1);
            int pad = 0;
            auto pad_it = node.params.find("pad");
            if (pad_it != node.params.end()) {
                if (std::holds_alternative<int>(pad_it->second)) {
                    pad = std::get<int>(pad_it->second);
                } else if (std::holds_alternative<std::string>(pad_it->second)) {
                    std::string pad_str = std::get<std::string>(pad_it->second);
                    pad = pad_str == "same" ? (kernel - 1) / 2 : std::stoi(pad_str);
                }
            }
            int dilation = get_int_param(node, "dilation", 1);
            int oh = (h + 2 * pad - dilation * (kernel - 1) - 1) / stride + 1;
            int ow = (w + 2 * pad - dilation * (kernel - 1) - 1) / stride + 1;
            return {out_channels, oh, ow};
        }

        std::vector<int> pool_output_shape(const std::vector<int>& input_shape, const Node& node) {
            if (input_shape.size() < 2) return {};
            int h = input_shape[input_shape.size() - 2];
            int w = input_shape[input_shape.size() - 1];
            int kernel = get_int_param(node, "kernel_size", 1);
            int stride = get_int_param(node, "stride", kernel);
            int pad = get_int_param(node, "pad", 0);
            int oh = (h + 2 * pad - kernel) / stride + 1;
            int ow = (w + 2 * pad - kernel) / stride + 1;
            return {input_shape[0], oh, ow};
        }

        std::vector<int> adaptive_pool_output_shape(const std::vector<int>& input_shape, const Node& node) {
            int out_h = get_int_param(node, "output_size_h", 1);
            int out_w = get_int_param(node, "output_size_w", 1);
            if (input_shape.empty()) return {out_h, out_w};
            return {input_shape[0], out_h, out_w};
        }

        std::vector<int> dense_output_shape(const std::vector<int>& input_shape, const Node& node) {
            int out_features = get_int_param(node, "out_features", 0);
            if (input_shape.empty()) return {out_features};
            return {out_features};
        }

        std::vector<int> flatten_output_shape(const std::vector<int>& input_shape) {
            int total = 1;
            for (int d : input_shape) total *= d;
            return {total};
        }

        std::vector<int> view_output_shape(const std::vector<int>& input_shape, const Node& node) {
            std::vector<int> shape;
            auto it = node.params.find("shape");
            if (it != node.params.end() && std::holds_alternative<std::vector<int>>(it->second)) {
                shape = std::get<std::vector<int>>(it->second);
            }
            if (shape.empty()) return input_shape;

            int total = 1;
            for (int d : input_shape) total *= d;

            int minus_one_idx = -1;
            int known_product = 1;
            for (size_t i = 0; i < shape.size(); ++i) {
                if (shape[i] == -1) {
                    minus_one_idx = static_cast<int>(i);
                } else {
                    known_product *= shape[i];
                }
            }

            std::vector<int> out = shape;
            if (minus_one_idx >= 0) {
                out[minus_one_idx] = total / known_product;
            }
            return out;
        }

        std::vector<int> rnn_output_shape(const std::vector<int>& input_shape, const Node& node) {
            if (input_shape.empty()) return {};
            int hidden = get_int_param(node, "hidden_size", 0);
            int num_layers = get_int_param(node, "num_layers", 1);
            bool bidirectional = false;
            auto it = node.params.find("bidirectional");
            if (it != node.params.end() && std::holds_alternative<bool>(it->second)) {
                bidirectional = std::get<bool>(it->second);
            }
            int d = bidirectional ? 2 : 1;
            // 输出形状：(batch, seq, hidden*directions)
            return {d * hidden};
        }
    }

    std::vector<int> infer_output_shape(const Node& node, const std::vector<const Tensor*>& inputs) {
        std::vector<int> input_shape;
        if (!inputs.empty() && inputs[0]) input_shape = inputs[0]->shape;

        const std::string& t = node.type;
        if (t == "input") {
            if (node.params.count("shape") && std::holds_alternative<std::vector<int>>(node.params.at("shape"))) {
                return std::get<std::vector<int>>(node.params.at("shape"));
            }
            return input_shape;
        }
        if (t == "conv2d") return conv2d_output_shape(input_shape, node);
        if (t == "maxpool2d" || t == "avgpool2d") return pool_output_shape(input_shape, node);
        if (t == "adaptive_avgpool2d") return adaptive_pool_output_shape(input_shape, node);
        if (t == "dense" || t == "linear") return dense_output_shape(input_shape, node);
        if (t == "flatten") return flatten_output_shape(input_shape);
        if (t == "dropout" || t == "relu" || t == "tanh" || t == "sigmoid" || t == "gelu" ||
            t == "leaky_relu" || t == "softmax" || t == "batchnorm2d") {
            return input_shape;
        }
        if (t == "layernorm") {
            return input_shape;
        }
        if (t == "view") {
            return view_output_shape(input_shape, node);
        }
        if (t == "lstm" || t == "gru") return rnn_output_shape(input_shape, node);
        if (t == "add" || t == "concat") {
            if (inputs.empty() || !inputs[0]) return {};
            return inputs[0]->shape;
        }
        if (t == "embedding") {
            int embedding_dim = get_int_param(node, "embedding_dim", 0);
            return {embedding_dim};
        }
        return {};
    }

    void infer_node_params(Node& node, const std::vector<const Tensor*>& inputs) {
        if (inputs.empty() || !inputs[0]) return;
        const std::vector<int>& in_shape = inputs[0]->shape;
        if (node.type == "conv2d" && !in_shape.empty()) {
            node.params["in_channels"] = in_shape[0];
        }
        if ((node.type == "dense" || node.type == "linear") && !in_shape.empty()) {
            int total = 1;
            for (int d : in_shape) total *= d;
            node.params["in_features"] = total;
        }
        if (node.type == "adaptive_avgpool2d") {
            std::vector<int> out_size = {1, 1};
            auto it = node.params.find("output_size");
            if (it != node.params.end() && std::holds_alternative<std::vector<int>>(it->second)) {
                out_size = std::get<std::vector<int>>(it->second);
            }
            node.params["output_size_h"] = out_size.size() > 0 ? out_size[0] : 1;
            node.params["output_size_w"] = out_size.size() > 1 ? out_size[1] : out_size[0];
        }
    }

    bool propagate_shapes(Graph& graph) {
        for (Node& node : graph.nodes) {
            std::vector<const Tensor*> inputs;
            for (int tid : node.inputs) {
                if (tid < 0 || tid >= static_cast<int>(graph.tensors.size())) return false;
                inputs.push_back(&graph.tensors[tid]);
            }
            infer_node_params(node, inputs);
            std::vector<int> out_shape = infer_output_shape(node, inputs);
            for (int tid : node.outputs) {
                if (tid < 0 || tid >= static_cast<int>(graph.tensors.size())) return false;
                graph.tensors[tid].shape = out_shape;
            }
        }
        return true;
    }
}