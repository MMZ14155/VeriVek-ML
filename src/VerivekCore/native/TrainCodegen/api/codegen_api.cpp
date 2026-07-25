#include "codegen_api.h"

#include "training_code_generator.h"

#include <cctype>
#include <stdexcept>
#include <string>
#include <thread>
#include <utility>
#include <vector>

namespace train_codegen {
    namespace api {
        thread_local std::string g_result_string;
        thread_local std::string g_error_string;

        namespace {
            // 极简 JSON 值表示与解析器（与 VekCompiler 风格一致，无第三方依赖）
            struct JsonValue {
                enum class Type { Null, Bool, Number, String, Object, Array };

                Type type = Type::Null;
                bool boolean = false;
                double number = 0.0;
                std::string str;
                std::vector<std::pair<std::string, JsonValue>> object;
                std::vector<JsonValue> array;

                const JsonValue* find(const std::string& key) const {
                    if (type != Type::Object) return nullptr;
                    for (const auto& [k, v] : object) {
                        if (k == key) return &v;
                    }
                    return nullptr;
                }
            };

            class JsonParser {
            public:
                explicit JsonParser(const std::string& s) : s_(s), pos_(0) {}

                JsonValue parse() {
                    try {
                        JsonValue v = parse_value();
                        skip_ws();
                        if (pos_ != s_.size()) throw std::runtime_error("unexpected trailing characters in JSON");
                        return v;
                    } catch (const std::exception& e) {
                        throw std::runtime_error(std::string(e.what()) + " (offset " +
                                                std::to_string(pos_) + ", input: " + s_ + ")");
                    }
                }

            private:
                const std::string& s_;
                size_t pos_;

                char peek() const { return pos_ < s_.size() ? s_[pos_] : '\0'; }
                char get() {
                    if (pos_ >= s_.size()) throw std::runtime_error("unexpected end of JSON");
                    return s_[pos_++];
                }

                void skip_ws() {
                    while (pos_ < s_.size() && std::isspace(static_cast<unsigned char>(s_[pos_]))) ++pos_;
                }

                void expect(char c) {
                    skip_ws();
                    if (get() != c) throw std::runtime_error(std::string("expected '") + c + "' in JSON");
                }

                JsonValue parse_value() {
                    skip_ws();
                    char c = peek();
                    if (c == '{') return parse_object();
                    if (c == '[') return parse_array();
                    if (c == '"') {
                        JsonValue v;
                        v.type = JsonValue::Type::String;
                        v.str = parse_string();
                        return v;
                    }
                    if (c == 't' || c == 'f') return parse_bool();
                    if (c == 'n') return parse_null();
                    return parse_number();
                }

                JsonValue parse_object() {
                    JsonValue v;
                    v.type = JsonValue::Type::Object;
                    expect('{');
                    skip_ws();
                    if (peek() == '}') { get(); return v; }
                    while (true) {
                        skip_ws();
                        std::string key = parse_string();
                        expect(':');
                        JsonValue val = parse_value();
                        v.object.emplace_back(std::move(key), std::move(val));
                        skip_ws();
                        char c = get();
                        if (c == '}') break;
                        if (c != ',') throw std::runtime_error("expected ',' or '}' in JSON object");
                    }
                    return v;
                }

                JsonValue parse_array() {
                    JsonValue v;
                    v.type = JsonValue::Type::Array;
                    expect('[');
                    skip_ws();
                    if (peek() == ']') { get(); return v; }
                    while (true) {
                        v.array.push_back(parse_value());
                        skip_ws();
                        char c = get();
                        if (c == ']') break;
                        if (c != ',') throw std::runtime_error("expected ',' or ']' in JSON array");
                    }
                    return v;
                }

                std::string parse_string() {
                    skip_ws();
                    if (get() != '"') throw std::runtime_error("expected string in JSON");
                    std::string out;
                    while (true) {
                        char c = get();
                        if (c == '"') break;
                        if (c == '\\') {
                            char esc = get();
                            switch (esc) {
                                case '"': out.push_back('"'); break;
                                case '\\': out.push_back('\\'); break;
                                case '/': out.push_back('/'); break;
                                case 'b': out.push_back('\b'); break;
                                case 'f': out.push_back('\f'); break;
                                case 'n': out.push_back('\n'); break;
                                case 'r': out.push_back('\r'); break;
                                case 't': out.push_back('\t'); break;
                                case 'u': {
                                    unsigned code = parse_hex4();
                                    append_utf8(out, code);
                                    break;
                                }
                                default: throw std::runtime_error("invalid escape in JSON string");
                            }
                        } else {
                            out.push_back(c);
                        }
                    }
                    return out;
                }

                unsigned parse_hex4() {
                    unsigned code = 0;
                    for (int i = 0; i < 4; ++i) {
                        char c = get();
                        code <<= 4;
                        if (c >= '0' && c <= '9') code |= static_cast<unsigned>(c - '0');
                        else if (c >= 'a' && c <= 'f') code |= static_cast<unsigned>(c - 'a' + 10);
                        else if (c >= 'A' && c <= 'F') code |= static_cast<unsigned>(c - 'A' + 10);
                        else throw std::runtime_error("invalid \\u escape in JSON string");
                    }
                    return code;
                }

                static void append_utf8(std::string& out, unsigned code) {
                    if (code < 0x80) {
                        out.push_back(static_cast<char>(code));
                    } else if (code < 0x800) {
                        out.push_back(static_cast<char>(0xC0 | (code >> 6)));
                        out.push_back(static_cast<char>(0x80 | (code & 0x3F)));
                    } else {
                        out.push_back(static_cast<char>(0xE0 | (code >> 12)));
                        out.push_back(static_cast<char>(0x80 | ((code >> 6) & 0x3F)));
                        out.push_back(static_cast<char>(0x80 | (code & 0x3F)));
                    }
                }

                JsonValue parse_bool() {
                    JsonValue v;
                    v.type = JsonValue::Type::Bool;
                    if (s_.compare(pos_, 4, "true") == 0) {
                        pos_ += 4;
                        v.boolean = true;
                    } else if (s_.compare(pos_, 5, "false") == 0) {
                        pos_ += 5;
                        v.boolean = false;
                    } else {
                        throw std::runtime_error("invalid literal in JSON");
                    }
                    return v;
                }

                JsonValue parse_null() {
                    if (s_.compare(pos_, 4, "null") != 0) throw std::runtime_error("invalid literal in JSON");
                    pos_ += 4;
                    return JsonValue{};
                }

                JsonValue parse_number() {
                    skip_ws();
                    size_t start = pos_;
                    if (peek() == '-') ++pos_;
                    while (pos_ < s_.size() && (std::isdigit(static_cast<unsigned char>(s_[pos_])) ||
                        s_[pos_] == '.' || s_[pos_] == 'e' || s_[pos_] == 'E' ||
                        s_[pos_] == '+' || s_[pos_] == '-')) {
                        ++pos_;
                    }
                    if (start == pos_) throw std::runtime_error("invalid number in JSON");
                    JsonValue v;
                    v.type = JsonValue::Type::Number;
                    v.number = std::stod(s_.substr(start, pos_ - start));
                    return v;
                }
            };

            // 从 JSON 对象读取字段，带类型校验
            std::string get_string(const JsonValue& obj, const char* key, const std::string& fallback) {
                const JsonValue* v = obj.find(key);
                if (!v || v->type == JsonValue::Type::Null) return fallback;
                if (v->type != JsonValue::Type::String) {
                    throw std::runtime_error(std::string("field '") + key + "' must be a string");
                }
                return v->str;
            }

            int get_int(const JsonValue& obj, const char* key, int fallback) {
                const JsonValue* v = obj.find(key);
                if (!v || v->type == JsonValue::Type::Null) return fallback;
                if (v->type != JsonValue::Type::Number) {
                    throw std::runtime_error(std::string("field '") + key + "' must be a number");
                }
                return static_cast<int>(v->number);
            }

            double get_number(const JsonValue& obj, const char* key, double fallback) {
                const JsonValue* v = obj.find(key);
                if (!v || v->type == JsonValue::Type::Null) return fallback;
                if (v->type != JsonValue::Type::Number) {
                    throw std::runtime_error(std::string("field '") + key + "' must be a number");
                }
                return v->number;
            }
        } // namespace

        extern "C" {
            const char* tc_generate_training_script(const char* config_json) {
                g_result_string.clear();
                g_error_string.clear();

                try {
                    std::string model_class_name = "Model";
                    Hyperparameters hyperparams;   // 默认即 Python 版 DEFAULT_HYPERPARAMS
                    DatasetConfig dataset_config;  // 默认即 Python 版 dataset_config 缺省值

                    // config_json 可为 NULL 或空对象，表示全部使用默认值
                    if (config_json && *config_json) {
                        // 注意：input 必须具名，JsonParser 内部仅持有字符串引用，
                        // 直接用临时 string 构造会导致悬垂引用
                        const std::string input(config_json);
                        JsonParser parser(input);
                        JsonValue root = parser.parse();
                        if (root.type != JsonValue::Type::Object) {
                            throw std::runtime_error("config must be a JSON object");
                        }

                        model_class_name = get_string(root, "model_class_name", model_class_name);

                        // 超参数：仅覆盖 JSON 中出现的字段（对应 Python 版 dict 合并）
                        if (const JsonValue* hp = root.find("hyperparameters")) {
                            if (hp->type != JsonValue::Type::Object) {
                                throw std::runtime_error("field 'hyperparameters' must be an object");
                            }
                            hyperparams.epochs = get_int(*hp, "epochs", hyperparams.epochs);
                            hyperparams.batch_size = get_int(*hp, "batch_size", hyperparams.batch_size);
                            hyperparams.lr = get_number(*hp, "lr", hyperparams.lr);
                            hyperparams.optimizer = get_string(*hp, "optimizer", hyperparams.optimizer);
                        }

                        // 数据集配置：支持顶层扁平字段与嵌套 dataset_config 两种形式
                        dataset_config.data_root = get_string(root, "data_root", dataset_config.data_root);
                        dataset_config.num_classes = get_int(root, "num_classes", dataset_config.num_classes);
                        if (const JsonValue* ds = root.find("dataset_config")) {
                            if (ds->type != JsonValue::Type::Object) {
                                throw std::runtime_error("field 'dataset_config' must be an object");
                            }
                            dataset_config.type = get_string(*ds, "type", dataset_config.type);
                            dataset_config.data_root = get_string(*ds, "data_root", dataset_config.data_root);
                            dataset_config.num_classes = get_int(*ds, "num_classes", dataset_config.num_classes);
                        }
                    }

                    TrainingCodeGenerator generator(model_class_name, hyperparams, dataset_config);
                    g_result_string = generator.generate();
                    return g_result_string.c_str();
                } catch (const std::exception& e) {
                    g_error_string = std::string("generate error: ") + e.what();
                    return nullptr;
                } catch (...) {
                    g_error_string = "unknown generate error";
                    return nullptr;
                }
            }

            const char* tc_get_hyperparameter_schema(void) {
                g_result_string.clear();
                g_error_string.clear();

                try {
                    TrainingCodeGenerator generator;
                    g_result_string = generator.get_hyperparameter_schema();
                    return g_result_string.c_str();
                } catch (const std::exception& e) {
                    g_error_string = std::string("schema error: ") + e.what();
                    return nullptr;
                } catch (...) {
                    g_error_string = "unknown schema error";
                    return nullptr;
                }
            }

            const char* tc_get_last_error(void) {
                return g_error_string.c_str();
            }
        } // extern "C"
    } // namespace api
} // namespace train_codegen