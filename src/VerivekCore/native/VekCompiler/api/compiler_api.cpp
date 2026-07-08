#include "compiler_api.h"

#include "fgraph_to_vek.h"
#include "ir.h"
#include "ir_builder.h"
#include "json_to_fgraph.h"
#include "lexer.h"
#include "parser.h"
#include "pytorch.h"
#include "shape.h"
#include "tensorflow.h"

#include <cctype>
#include <cstring>
#include <stdexcept>
#include <string>
#include <thread>

namespace vek {
    namespace api {
        thread_local std::string g_result_string;
        thread_local std::string g_error_string;

        namespace {
            std::string to_lower(const char* s) {
                std::string out;
                if (s) {
                    for (const char* p = s; *p; ++p) {
                        out.push_back(static_cast<char>(std::tolower(static_cast<unsigned char>(*p))));
                    }
                }
                return out;
            }

            std::string compile_graph(Graph& graph, const std::string& target) {
                if (target == "pytorch") {
                    return generate_pytorch(graph);
                }
                if (target == "tensorflow") {
                    return generate_tensorflow(graph);
                }
                throw std::runtime_error("unsupported target: " + target);
            }
        }

        extern "C" {
            const char* vek_compile(const char* vek_source, const char* target) {
                g_result_string.clear();
                g_error_string.clear();

                if (!vek_source) {
                    g_error_string = "null source string";
                    return nullptr;
                }
                if (!target) {
                    g_error_string = "null target string";
                    return nullptr;
                }

                const std::string target_lower = to_lower(target);

                try {
                    Lexer lexer(vek_source);
                    Parser parser(vek_source);
                    auto program = parser.parse();
                    if (!program) {
                        g_error_string = "parse error: " + parser.error();
                        return nullptr;
                    }

                    Graph graph = build_ir(*program);
                    if (!propagate_shapes(graph)) {
                        g_error_string = "shape propagation failed";
                        return nullptr;
                    }

                    g_result_string = compile_graph(graph, target_lower);
                    return g_result_string.c_str();
                } catch (const std::exception& e) {
                    g_error_string = std::string("compile error: ") + e.what();
                    return nullptr;
                } catch (...) {
                    g_error_string = "unknown compile error";
                    return nullptr;
                }
            }

            const char* vek_graph_to_vek(const char* graph_json) {
                g_result_string.clear();
                g_error_string.clear();
                if (!graph_json) {
                    g_error_string = "null graph json";
                    return nullptr;
                }
                try {
                    FrontendGraph graph = json_to_frontend_graph(graph_json);
                    g_result_string = frontend_graph_to_vek(graph);
                    return g_result_string.c_str();
                } catch (const std::exception& e) {
                    g_error_string = std::string("graph to vek error: ") + e.what();
                    return nullptr;
                } catch (...) {
                    g_error_string = "unknown graph to vek error";
                    return nullptr;
                }
            }

            const char* vek_get_last_error(void) {
                return g_error_string.c_str();
            }
        }
    }
}