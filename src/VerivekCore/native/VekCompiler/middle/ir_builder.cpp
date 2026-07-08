#include "ir_builder.h"

#include <cassert>
#include <stdexcept>

namespace vek {
    namespace {
        class IrBuilder {
        public:
            Graph build(const AstProgram& program, const std::string& target_name) {
                const AstNetwork* target = nullptr;
                for (const auto& net : program.networks) {
                    if (target_name.empty() || net->name == target_name) {
                        target = net.get();
                        break;
                    }
                }
                if (!target) {
                    throw std::runtime_error("network not found: " + target_name);
                }

                graph_.name = target->name;
                scope_.clear();
                current_tensor_ = -1;
                input_tensor_ = -1;

                for (const auto& stmt : target->body) {
                    build_statement(*stmt);
                }

                graph_.input_tensor = input_tensor_;
                if (graph_.output_tensors.empty()) {
                    if (current_tensor_ >= 0) {
                        graph_.output_tensors.push_back(current_tensor_);
                    }
                }
                return graph_;
            }

        private:
            Graph graph_;
            std::map<std::string, int> scope_;
            int current_tensor_ = -1;
            int input_tensor_ = -1;
            int temp_counter_ = 0;

            std::string make_temp_name() {
                return "%t" + std::to_string(++temp_counter_);
            }

            int resolve_expression(const AstExpression& expr) {
                if (const auto* id = dynamic_cast<const AstIdentifier*>(&expr)) {
                    auto it = scope_.find(id->name);
                    if (it == scope_.end()) {
                        throw std::runtime_error("undefined variable: " + id->name);
                    }
                    return it->second;
                }
                if (const auto* call = dynamic_cast<const AstLayerCall*>(&expr)) {
                    return emit_layer_call(*call);
                }
                throw std::runtime_error("unsupported expression");
            }

            int emit_layer_call(const AstLayerCall& call) {
                std::vector<int> inputs;
                if (call.inputs.empty()) {
                    // 顺序式隐式连接
                    if (current_tensor_ < 0) {
                        throw std::runtime_error("no implicit input available for layer: " + call.layer_type);
                    }
                    inputs.push_back(current_tensor_);
                } else {
                    for (const auto& in : call.inputs) {
                        inputs.push_back(resolve_expression(*in));
                    }
                }

                std::map<std::string, ParamValue> params;
                for (const auto& arg : call.args) {
                    std::string key = arg.name.empty() ? infer_arg_name(call.layer_type, params.size()) : arg.name;
                    params[key] = arg.value;
                }

                std::string out_name = make_temp_name();
                int out_id = graph_.add_tensor(out_name);
                int node_id = graph_.add_node(call.layer_type, params, inputs, {out_id});
                (void)node_id;
                current_tensor_ = out_id;
                return out_id;
            }

            std::string infer_arg_name(const std::string& layer_type, size_t position) {
                // 常见层的位置参数映射
                if (layer_type == "conv2d") {
                    if (position == 0) return "out_channels";
                    if (position == 1) return "kernel_size";
                }
                if (layer_type == "maxpool2d" || layer_type == "avgpool2d") {
                    if (position == 0) return "kernel_size";
                }
                if (layer_type == "dense" || layer_type == "linear") {
                    if (position == 0) return "out_features";
                }
                if (layer_type == "dropout") {
                    if (position == 0) return "p";
                }
                if (layer_type == "embedding") {
                    if (position == 0) return "num_embeddings";
                    if (position == 1) return "embedding_dim";
                }
                if (layer_type == "lstm" || layer_type == "gru") {
                    if (position == 0) return "hidden_size";
                }
                return "arg" + std::to_string(position);
            }

            void build_statement(const AstStatement& stmt) {
                if (const auto* assign = dynamic_cast<const AstAssignment*>(&stmt)) {
                    int tid = -1;
                    if (const auto* call = dynamic_cast<const AstLayerCall*>(assign->rhs.get())) {
                        if (call->layer_type == "input") {
                            tid = build_input(*call);
                        } else {
                            tid = emit_layer_call(*call);
                        }
                    } else {
                        tid = resolve_expression(*assign->rhs);
                    }
                    if (!assign->lhs.empty()) {
                        graph_.tensors[tid].name = assign->lhs;
                        scope_[assign->lhs] = tid;
                    }
                    current_tensor_ = tid;
                } else if (const auto* ret = dynamic_cast<const AstReturn*>(&stmt)) {
                    graph_.output_tensors.clear();
                    for (const auto& name : ret->names) {
                        auto it = scope_.find(name);
                        if (it == scope_.end()) {
                            throw std::runtime_error("return references undefined variable: " + name);
                        }
                        graph_.output_tensors.push_back(it->second);
                    }
                    if (graph_.output_tensors.empty() && current_tensor_ >= 0) {
                        graph_.output_tensors.push_back(current_tensor_);
                    }
                }
            }

            int build_input(const AstLayerCall& call) {
                std::vector<int> shape;
                for (const auto& arg : call.args) {
                    if (std::holds_alternative<std::vector<int>>(arg.value)) {
                        shape = std::get<std::vector<int>>(arg.value);
                    }
                }
                std::string name = "x";
                int tid = graph_.add_tensor(name, shape);
                input_tensor_ = tid;
                current_tensor_ = tid;
                return tid;
            }
        };
    } 

    Graph build_ir(const AstProgram& program, const std::string& target_name) {
        IrBuilder builder;
        return builder.build(program, target_name);
    }
}