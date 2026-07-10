#include "pytorch.h"

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

        double get_double_param(const Node& node, const std::string& key, double default_value) {
            auto it = node.params.find(key);
            if (it == node.params.end()) return default_value;
            if (std::holds_alternative<double>(it->second)) return std::get<double>(it->second);
            if (std::holds_alternative<int>(it->second)) return static_cast<double>(std::get<int>(it->second));
            return default_value;
        }

        bool get_bool_param(const Node& node, const std::string& key, bool default_value) {
            auto it = node.params.find(key);
            if (it == node.params.end()) return default_value;
            if (std::holds_alternative<bool>(it->second)) return std::get<bool>(it->second);
            return default_value;
        }

        std::string get_string_param(const Node& node, const std::string& key, const std::string& default_value) {
            auto it = node.params.find(key);
            if (it == node.params.end()) return default_value;
            if (std::holds_alternative<std::string>(it->second)) return std::get<std::string>(it->second);
            return default_value;
        }

        std::string make_layer_name(const std::string& type, int index) {
            return type + "_" + std::to_string(index);
        }

        std::string py_bool(bool b) { return b ? "True" : "False"; }
    }

    std::string generate_pytorch(const Graph& graph) {
        std::ostringstream init;
        std::ostringstream forward;
        std::map<int, std::string> tensor_names;
        std::map<std::string, int> layer_counts;

        auto class_name = graph.name.empty() ? "Model" : graph.name;

        init << "        super().__init__()\n";

        if (graph.input_tensor >= 0) {
            tensor_names[graph.input_tensor] = "x";
        }

        for (const Node& node : graph.nodes) {
            const std::string& type = node.type;
            std::string out_var;

            // 确定输出变量名
            if (!node.outputs.empty()) {
                int out_id = node.outputs[0];
                if (tensor_names.count(out_id)) {
                    out_var = tensor_names[out_id];
                } else {
                    const Tensor& t = graph.tensors[out_id];
                    out_var = t.name.empty() || t.name[0] == '%' ? "x" : t.name;
                    tensor_names[out_id] = out_var;
                }
            }

            // 构建输入表达式列表
            std::vector<std::string> input_exprs;
            for (int in_id : node.inputs) {
                auto it = tensor_names.find(in_id);
                if (it != tensor_names.end()) {
                    input_exprs.push_back(it->second);
                } else {
                    input_exprs.push_back("x");
                }
            }

            if (type == "input") continue;

            if (type == "conv2d") {
                int idx = ++layer_counts["conv2d"];
                std::string name = make_layer_name("conv2d", idx);
                int in_ch = get_int_param(node, "in_channels", 1);
                int out_ch = get_int_param(node, "out_channels", 1);
                int k = get_int_param(node, "kernel_size", 1);
                int s = get_int_param(node, "stride", 1);
                int pad = 0;
                auto pad_it = node.params.find("pad");
                if (pad_it != node.params.end()) {
                    if (std::holds_alternative<int>(pad_it->second)) {
                        pad = std::get<int>(pad_it->second);
                    } else if (std::holds_alternative<std::string>(pad_it->second)) {
                        std::string pad_str = std::get<std::string>(pad_it->second);
                        pad = pad_str == "same" ? (k - 1) / 2 : std::stoi(pad_str);
                    }
                }
                bool bias = get_bool_param(node, "bias", true);
                init << "        self." << name << " = nn.Conv2d(" << in_ch << ", " << out_ch << ", " << k
                    << ", stride=" << s << ", padding=" << pad << ", bias=" << py_bool(bias) << ")\n";
                forward << "        " << out_var << " = self." << name << "(" << input_exprs[0] << ")\n";
            } else if (type == "maxpool2d") {
                int idx = ++layer_counts["maxpool2d"];
                std::string name = make_layer_name("maxpool2d", idx);
                int k = get_int_param(node, "kernel_size", 1);
                int s = get_int_param(node, "stride", k);
                int pad = get_int_param(node, "pad", 0);
                init << "        self." << name << " = nn.MaxPool2d(" << k << ", stride=" << s << ", padding=" << pad << ")\n";
                forward << "        " << out_var << " = self." << name << "(" << input_exprs[0] << ")\n";
            } else if (type == "avgpool2d") {
                int idx = ++layer_counts["avgpool2d"];
                std::string name = make_layer_name("avgpool2d", idx);
                int k = get_int_param(node, "kernel_size", 1);
                int s = get_int_param(node, "stride", k);
                int pad = get_int_param(node, "pad", 0);
                init << "        self." << name << " = nn.AvgPool2d(" << k << ", stride=" << s << ", padding=" << pad << ")\n";
                forward << "        " << out_var << " = self." << name << "(" << input_exprs[0] << ")\n";
            } else if (type == "adaptive_avgpool2d") {
                int idx = ++layer_counts["adaptive_avgpool2d"];
                std::string name = make_layer_name("adaptive_avgpool2d", idx);
                int out_h = get_int_param(node, "output_size_h", 1);
                int out_w = get_int_param(node, "output_size_w", 1);
                init << "        self." << name << " = nn.AdaptiveAvgPool2d((" << out_h << ", " << out_w << "))\n";
                forward << "        " << out_var << " = self." << name << "(" << input_exprs[0] << ")\n";
            } else if (type == "dense" || type == "linear") {
                int idx = ++layer_counts["dense"];
                std::string name = make_layer_name("dense", idx);
                int in_f = get_int_param(node, "in_features", 1);
                int out_f = get_int_param(node, "out_features", 1);
                bool bias = get_bool_param(node, "bias", true);
                init << "        self." << name << " = nn.Linear(" << in_f << ", " << out_f << ", bias=" << py_bool(bias) << ")\n";
                forward << "        " << out_var << " = self." << name << "(" << input_exprs[0] << ")\n";
            } else if (type == "batchnorm2d") {
                int idx = ++layer_counts["batchnorm2d"];
                std::string name = make_layer_name("batchnorm2d", idx);
                int num_features = get_int_param(node, "num_features", 1);
                if (num_features == 1 && !node.inputs.empty() && node.inputs[0] >= 0) {
                    num_features = graph.tensors[node.inputs[0]].shape[0];
                }
                double eps = get_double_param(node, "eps", 1e-5);
                double momentum = get_double_param(node, "momentum", 0.1);
                init << "        self." << name << " = nn.BatchNorm2d(" << num_features << ", eps=" << eps
                    << ", momentum=" << momentum << ")\n";
                forward << "        " << out_var << " = self." << name << "(" << input_exprs[0] << ")\n";
            } else if (type == "dropout") {
                int idx = ++layer_counts["dropout"];
                std::string name = make_layer_name("dropout", idx);
                double p = get_double_param(node, "p", 0.5);
                init << "        self." << name << " = nn.Dropout(" << p << ")\n";
                forward << "        " << out_var << " = self." << name << "(" << input_exprs[0] << ")\n";
            } else if (type == "flatten") {
                forward << "        " << out_var << " = torch.flatten(" << input_exprs[0] << ", 1)\n";
            } else if (type == "relu") {
                forward << "        " << out_var << " = F.relu(" << input_exprs[0] << ")\n";
            } else if (type == "tanh") {
                forward << "        " << out_var << " = torch.tanh(" << input_exprs[0] << ")\n";
            } else if (type == "sigmoid") {
                forward << "        " << out_var << " = torch.sigmoid(" << input_exprs[0] << ")\n";
            } else if (type == "gelu") {
                forward << "        " << out_var << " = F.gelu(" << input_exprs[0] << ")\n";
            } else if (type == "leaky_relu") {
                double negative_slope = get_double_param(node, "negative_slope", 0.01);
                forward << "        " << out_var << " = F.leaky_relu(" << input_exprs[0] << ", negative_slope=" << negative_slope << ")\n";
            } else if (type == "softmax") {
                int dim = get_int_param(node, "dim", 1);
                forward << "        " << out_var << " = F.softmax(" << input_exprs[0] << ", dim=" << dim << ")\n";
            } else if (type == "layernorm") {
                int idx = ++layer_counts["layernorm"];
                std::string name = make_layer_name("layernorm", idx);
                std::vector<int> normalized_shape;
                auto it = node.params.find("normalized_shape");
                if (it != node.params.end() && std::holds_alternative<std::vector<int>>(it->second)) {
                    normalized_shape = std::get<std::vector<int>>(it->second);
                }
                double eps = get_double_param(node, "eps", 1e-5);
                bool elementwise_affine = get_bool_param(node, "elementwise_affine", true);
                init << "        self." << name << " = nn.LayerNorm(";
                if (normalized_shape.size() == 1) {
                    init << normalized_shape[0];
                } else {
                    init << "(";
                    for (size_t i = 0; i < normalized_shape.size(); ++i) {
                        if (i > 0) init << ", ";
                        init << normalized_shape[i];
                    }
                    init << ")";
                }
                init << ", eps=" << eps << ", elementwise_affine=" << py_bool(elementwise_affine) << ")\n";
                forward << "        " << out_var << " = self." << name << "(" << input_exprs[0] << ")\n";
            } else if (type == "view") {
                std::vector<int> shape;
                auto it = node.params.find("shape");
                if (it != node.params.end() && std::holds_alternative<std::vector<int>>(it->second)) {
                    shape = std::get<std::vector<int>>(it->second);
                }
                std::ostringstream shape_str;
                for (size_t i = 0; i < shape.size(); ++i) {
                    if (i > 0) shape_str << ", ";
                    if (shape[i] == -1) {
                        shape_str << input_exprs[0] << ".size(0)";
                    } else {
                        shape_str << shape[i];
                    }
                }
                forward << "        " << out_var << " = " << input_exprs[0] << ".view(" << shape_str.str() << ")\n";
            } else if (type == "add") {
                forward << "        " << out_var << " = torch.add(";
                for (size_t i = 0; i < input_exprs.size(); ++i) {
                    if (i > 0) forward << ", ";
                    forward << input_exprs[i];
                }
                forward << ")\n";
            } else if (type == "concat") {
                int dim = get_int_param(node, "dim", 1);
                forward << "        " << out_var << " = torch.cat([";
                for (size_t i = 0; i < input_exprs.size(); ++i) {
                    if (i > 0) forward << ", ";
                    forward << input_exprs[i];
                }
                forward << "], dim=" << dim << ")\n";
            } else if (type == "embedding") {
                int idx = ++layer_counts["embedding"];
                std::string name = make_layer_name("embedding", idx);
                int num = get_int_param(node, "num_embeddings", 1);
                int dim = get_int_param(node, "embedding_dim", 1);
                init << "        self." << name << " = nn.Embedding(" << num << ", " << dim << ")\n";
                forward << "        " << out_var << " = self." << name << "(" << input_exprs[0] << ")\n";
            } else if (type == "lstm") {
                int idx = ++layer_counts["lstm"];
                std::string name = make_layer_name("lstm", idx);
                int input_size = get_int_param(node, "input_size", 1);
                if (input_size == 1 && !node.inputs.empty() && node.inputs[0] >= 0 && !graph.tensors[node.inputs[0]].shape.empty()) {
                    input_size = graph.tensors[node.inputs[0]].shape.back();
                }
                int hidden = get_int_param(node, "hidden_size", 1);
                int layers = get_int_param(node, "num_layers", 1);
                bool bidir = get_bool_param(node, "bidirectional", false);
                bool bias = get_bool_param(node, "bias", true);
                init << "        self." << name << " = nn.LSTM(" << input_size << ", " << hidden << ", num_layers=" << layers
                    << ", bidirectional=" << py_bool(bidir) << ", bias=" << py_bool(bias) << ", batch_first=True)\n";
                forward << "        " << out_var << ", _ = self." << name << "(" << input_exprs[0] << ")\n";
            } else if (type == "gru") {
                int idx = ++layer_counts["gru"];
                std::string name = make_layer_name("gru", idx);
                int input_size = get_int_param(node, "input_size", 1);
                if (input_size == 1 && !node.inputs.empty() && node.inputs[0] >= 0 && !graph.tensors[node.inputs[0]].shape.empty()) {
                    input_size = graph.tensors[node.inputs[0]].shape.back();
                }
                int hidden = get_int_param(node, "hidden_size", 1);
                int layers = get_int_param(node, "num_layers", 1);
                bool bidir = get_bool_param(node, "bidirectional", false);
                bool bias = get_bool_param(node, "bias", true);
                init << "        self." << name << " = nn.GRU(" << input_size << ", " << hidden << ", num_layers=" << layers
                    << ", bidirectional=" << py_bool(bidir) << ", bias=" << py_bool(bias) << ", batch_first=True)\n";
                forward << "        " << out_var << ", _ = self." << name << "(" << input_exprs[0] << ")\n";
            } else {
                forward << "        # unsupported layer: " << type << "\n";
            }
        }

        std::string return_expr = "x";
        if (!graph.output_tensors.empty()) {
            auto it = tensor_names.find(graph.output_tensors[0]);
            if (it != tensor_names.end()) return_expr = it->second;
        }
        forward << "        return " << return_expr << "\n";

        std::ostringstream oss;
        oss << "import torch\n";
        oss << "import torch.nn as nn\n";
        oss << "import torch.nn.functional as F\n\n";
        oss << "class " << class_name << "(nn.Module):\n";
        oss << "    def __init__(self):\n";
        oss << init.str();
        oss << "\n    def forward(self, x):\n";
        oss << forward.str();
        return oss.str();
    }
}