#include "json_to_fgraph.h"

#include <cctype>
#include <stdexcept>
#include <string>

namespace vek {
    namespace {
        class JsonParser {
        public:
            explicit JsonParser(const std::string& s) : s_(s), pos_(0) {}

            FrontendGraph parse_graph() {
                FrontendGraph graph;
                graph.name = "Model";
                skip_ws();
                expect('{');
                while (!peek('}')) {
                    std::string key = parse_string();
                    skip_ws();
                    expect(':');
                    skip_ws();
                    if (key == "nodes") {
                        parse_nodes(graph);
                    } else if (key == "connections") {
                        parse_connections(graph);
                    } else {
                        skip_value();
                    }
                    skip_ws();
                    if (peek(',')) consume(',');
                }
                expect('}');
                return graph;
            }

        private:
            const std::string& s_;
            size_t pos_;

            char peek() const { return pos_ < s_.size() ? s_[pos_] : '\0'; }
            char get() { return pos_ < s_.size() ? s_[pos_++] : '\0'; }

            bool peek(char c) const { return peek() == c; }
            void expect(char c) {
                skip_ws();
                if (get() != c) throw std::runtime_error(std::string("expected '") + c + "'");
            }
            void consume(char c) { if (peek(c)) ++pos_; }

            void skip_ws() {
                while (pos_ < s_.size() && std::isspace(static_cast<unsigned char>(s_[pos_]))) ++pos_;
            }

            void skip_value() {
                skip_ws();
                char c = peek();
                if (c == '"') { parse_string(); return; }
                if (c == '{') { parse_object_skip(); return; }
                if (c == '[') { parse_array_skip(); return; }
                while (pos_ < s_.size() && s_[pos_] != ',' && s_[pos_] != '}' && s_[pos_] != ']') ++pos_;
            }

            void parse_object_skip() {
                expect('{');
                while (!peek('}')) {
                    skip_value();
                    skip_ws();
                    if (peek(',')) consume(',');
                }
                expect('}');
            }

            void parse_array_skip() {
                expect('[');
                while (!peek(']')) {
                    skip_value();
                    skip_ws();
                    if (peek(',')) consume(',');
                }
                expect(']');
            }

            std::string parse_string() {
                skip_ws();
                expect('"');
                std::string out;
                while (!peek('"')) {
                    char c = get();
                    if (c == '\0' || c == '\n') throw std::runtime_error("unterminated string");
                    if (c == '\\') {
                        char next = get();
                        switch (next) {
                            case '"': out.push_back('"'); break;
                            case '\\': out.push_back('\\'); break;
                            case '/': out.push_back('/'); break;
                            case 'b': out.push_back('\b'); break;
                            case 'f': out.push_back('\f'); break;
                            case 'n': out.push_back('\n'); break;
                            case 'r': out.push_back('\r'); break;
                            case 't': out.push_back('\t'); break;
                            default: out.push_back(next); break;
                        }
                    } else {
                        out.push_back(c);
                    }
                }
                expect('"');
                return out;
            }

            int parse_int() {
                skip_ws();
                size_t start = pos_;
                if (peek('-')) ++pos_;
                while (std::isdigit(static_cast<unsigned char>(peek()))) ++pos_;
                return std::stoi(s_.substr(start, pos_ - start));
            }

            double parse_double() {
                skip_ws();
                size_t start = pos_;
                if (peek('-')) ++pos_;
                while (std::isdigit(static_cast<unsigned char>(peek()))) ++pos_;
                if (peek('.')) {
                    ++pos_;
                    while (std::isdigit(static_cast<unsigned char>(peek()))) ++pos_;
                }
                return std::stod(s_.substr(start, pos_ - start));
            }

            bool parse_bool() {
                skip_ws();
                if (s_.compare(pos_, 4, "true") == 0) { pos_ += 4; return true; }
                if (s_.compare(pos_, 5, "false") == 0) { pos_ += 5; return false; }
                throw std::runtime_error("expected boolean");
            }

            ParamValue parse_param_value() {
                skip_ws();
                char c = peek();
                if (c == '"') return parse_string();
                if (c == '[') return parse_int_array();
                if (c == 't' || c == 'f') return parse_bool();
                if (c == '-') return parse_double_or_int();
                if (std::isdigit(static_cast<unsigned char>(c))) return parse_double_or_int();
                throw std::runtime_error("unexpected property value");
            }

            ParamValue parse_double_or_int() {
                size_t start = pos_;
                bool has_dot = false;
                if (peek('-')) ++pos_;
                while (std::isdigit(static_cast<unsigned char>(peek())) || peek('.')) {
                    if (peek('.')) has_dot = true;
                    ++pos_;
                }
                std::string token = s_.substr(start, pos_ - start);
                if (has_dot) return std::stod(token);
                return std::stoi(token);
            }

            std::vector<int> parse_int_array() {
                expect('[');
                std::vector<int> out;
                while (!peek(']')) {
                    skip_ws();
                    out.push_back(parse_int());
                    skip_ws();
                    if (peek(',')) consume(',');
                }
                expect(']');
                return out;
            }

            std::map<std::string, ParamValue> parse_properties() {
                expect('{');
                std::map<std::string, ParamValue> props;
                while (!peek('}')) {
                    std::string key = parse_string();
                    skip_ws();
                    expect(':');
                    skip_ws();
                    props[key] = parse_param_value();
                    skip_ws();
                    if (peek(',')) consume(',');
                }
                expect('}');
                return props;
            }

            void parse_nodes(FrontendGraph& graph) {
                expect('[');
                while (!peek(']')) {
                    expect('{');
                    int id = -1;
                    std::string type;
                    std::map<std::string, ParamValue> props;
                    while (!peek('}')) {
                        std::string key = parse_string();
                        skip_ws();
                        expect(':');
                        skip_ws();
                        if (key == "id") id = parse_int();
                        else if (key == "type") type = parse_string();
                        else if (key == "properties") props = parse_properties();
                        else skip_value();
                        skip_ws();
                        if (peek(',')) consume(',');
                    }
                    expect('}');

                    FrontendNode node;
                    node.id = std::to_string(id);
                    node.type = type;
                    node.params = props;
                    node.outputs = {node.id};
                    graph.nodes.push_back(std::move(node));

                    if (type == "Input") {
                        FrontendTensor ft;
                        ft.name = std::to_string(id);
                        auto it = props.find("shape");
                        if (it != props.end() && std::holds_alternative<std::vector<int>>(it->second)) {
                            std::vector<int> shape = std::get<std::vector<int>>(it->second);
                            // 去掉 batch 维度，Vek 输入使用 (C, H, W)
                            if (!shape.empty()) shape.erase(shape.begin());
                            ft.shape = std::move(shape);
                        }
                        graph.inputs.push_back(std::move(ft));
                    } else if (type == "Output") {
                        FrontendTensor ft;
                        ft.name = std::to_string(id);
                        graph.outputs.push_back(std::move(ft));
                    }

                    skip_ws();
                    if (peek(',')) consume(',');
                }
                expect(']');
            }

            void parse_connections(FrontendGraph& graph) {
                expect('[');
                while (!peek(']')) {
                    expect('{');
                    int from_id = -1;
                    int to_id = -1;
                    while (!peek('}')) {
                        std::string key = parse_string();
                        skip_ws();
                        expect(':');
                        skip_ws();
                        if (key == "from") from_id = parse_endpoint();
                        else if (key == "to") to_id = parse_endpoint();
                        else skip_value();
                        skip_ws();
                        if (peek(',')) consume(',');
                    }
                    expect('}');

                    for (auto& node : graph.nodes) {
                        if (node.id == std::to_string(to_id)) {
                            node.inputs.push_back(std::to_string(from_id));
                        }
                    }

                    skip_ws();
                    if (peek(',')) consume(',');
                }
                expect(']');
            }

            int parse_endpoint() {
                expect('{');
                int node_id = -1;
                while (!peek('}')) {
                    std::string key = parse_string();
                    skip_ws();
                    expect(':');
                    skip_ws();
                    if (key == "nodeId") node_id = parse_int();
                    else skip_value();
                    skip_ws();
                    if (peek(',')) consume(',');
                }
                expect('}');
                return node_id;
            }
        };

        std::string type_to_vek(const std::string& type) {
            if (type == "Input") return "input";
            if (type == "Output") return "Output";
            if (type == "Conv2d") return "conv2d";
            if (type == "MaxPool2d") return "maxpool2d";
            if (type == "AvgPool2d") return "avgpool2d";
            if (type == "Linear") return "dense";
            if (type == "ReLU") return "relu";
            if (type == "Tanh") return "tanh";
            if (type == "Sigmoid") return "sigmoid";
            if (type == "GELU") return "gelu";
            if (type == "Dropout") return "dropout";
            if (type == "BatchNorm2d") return "batchnorm2d";
            if (type == "Flatten") return "flatten";
            if (type == "Add") return "add";
            if (type == "Concat") return "concat";
            if (type == "LSTM") return "lstm";
            if (type == "GRU") return "gru";
            if (type == "Embedding") return "embedding";
            return type;
        }

        std::map<std::string, ParamValue> remap_params(const std::string& type, std::map<std::string, ParamValue> props) {
            std::map<std::string, ParamValue> out;
            for (auto& [key, value] : props) {
                if (key == "shape") continue;
                if (type == "flatten" && key == "end_dim") {
                    // end_dim=-1 表示展平到末尾，Vek 中省略即可
                    if (std::holds_alternative<int>(value) && std::get<int>(value) == -1) continue;
                }
                out[key] = std::move(value);
            }
            if (type == "Input" || type == "Output") return out;

            if (type == "Conv2d" || type == "MaxPool2d" || type == "AvgPool2d") {
                if (out.count("padding")) {
                    out["pad"] = out["padding"];
                    out.erase("padding");
                }
            }
            return out;
        }
    }

    FrontendGraph json_to_frontend_graph(const std::string& json) {
        JsonParser parser(json);
        FrontendGraph graph = parser.parse_graph();

        for (auto& node : graph.nodes) {
            node.type = type_to_vek(node.type);
            node.params = remap_params(node.type, std::move(node.params));
        }

        return graph;
    }
}