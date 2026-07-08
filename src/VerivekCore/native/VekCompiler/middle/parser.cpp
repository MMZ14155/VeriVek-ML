#include "parser.h"

#include <algorithm>
#include <cctype>

namespace vek {
    namespace {
        bool is_int_string(const std::string& s) {
            size_t i = 0;
            if (!s.empty() && s[0] == '-') i = 1;
            for (; i < s.size(); ++i) {
                if (!std::isdigit(static_cast<unsigned char>(s[i]))) return false;
            }
            return !s.empty() && (s.size() > 1 || std::isdigit(static_cast<unsigned char>(s[0])));
        }
    }

    Parser::Parser(std::string source) : lexer_(std::move(source)) {
        advance();
    }

    void Parser::advance() {
        current_ = lexer_.next_token();
        if (!lexer_.error().empty() && error_.empty()) {
            error_ = lexer_.error();
        }
    }

    bool Parser::expect(TokenType type, const std::string& what) {
        if (current_.type != type) {
            if (error_.empty()) {
                error_ = "expected " + what + " but got " + current_.text + " at line " + std::to_string(current_.line);
            }
            return false;
        }
        return true;
    }

    bool Parser::consume(TokenType type) {
        if (current_.type == type) {
            advance();
            return true;
        }
        return false;
    }

    std::unique_ptr<AstProgram> Parser::parse() {
        auto program = std::make_unique<AstProgram>();
        while (current_.type != TokenType::Eof) {
            if (current_.type == TokenType::Network) {
                program->networks.push_back(parse_network());
                if (!program->networks.back()) return nullptr;
            } else if (current_.type == TokenType::Block) {
                program->blocks.push_back(parse_block());
                if (!program->blocks.back()) return nullptr;
            } else {
                if (error_.empty()) {
                    error_ = "expected network or block at line " + std::to_string(current_.line);
                }
                return nullptr;
            }
        }
        return program;
    }

    std::unique_ptr<AstNetwork> Parser::parse_network() {
        advance(); // 跳过 'network'
        if (!expect(TokenType::Identifier, "network name")) return nullptr;
        auto net = std::make_unique<AstNetwork>();
        net->name = current_.text;
        advance();
        if (!expect(TokenType::LBrace, "{") || !consume(TokenType::LBrace)) return nullptr;
        while (current_.type != TokenType::RBrace && current_.type != TokenType::Eof) {
            auto stmt = parse_statement();
            if (!stmt) return nullptr;
            net->body.push_back(std::move(stmt));
        }
        if (!expect(TokenType::RBrace, "}") || !consume(TokenType::RBrace)) return nullptr;
        return net;
    }

    std::unique_ptr<AstBlock> Parser::parse_block() {
        advance(); // 跳过 'block'
        if (!expect(TokenType::Identifier, "block name")) return nullptr;
        auto block = std::make_unique<AstBlock>();
        block->name = current_.text;
        advance();
        if (consume(TokenType::LParen)) {
            while (current_.type != TokenType::RParen && current_.type != TokenType::Eof) {
                if (!expect(TokenType::Identifier, "parameter name")) return nullptr;
                block->params.push_back(current_.text);
                advance();
                if (current_.type == TokenType::Comma) {
                    advance();
                } else if (current_.type == TokenType::RParen) {
                    break;
                } else {
                    if (error_.empty()) error_ = "expected , or ) in block parameter list at line " + std::to_string(current_.line);
                    return nullptr;
                }
            }
            if (!expect(TokenType::RParen, ")") || !consume(TokenType::RParen)) return nullptr;
        }
        if (!expect(TokenType::LBrace, "{") || !consume(TokenType::LBrace)) return nullptr;
        while (current_.type != TokenType::RBrace && current_.type != TokenType::Eof) {
            auto stmt = parse_statement();
            if (!stmt) return nullptr;
            block->body.push_back(std::move(stmt));
        }
        if (!expect(TokenType::RBrace, "}") || !consume(TokenType::RBrace)) return nullptr;
        return block;
    }

    AstStatementPtr Parser::parse_statement() {
        if (current_.type == TokenType::Input) {
            return parse_input_statement();
        }
        if (current_.type == TokenType::Return) {
            return parse_return_statement();
        }
        if (current_.type == TokenType::Identifier) {
            std::string name = current_.text;
            advance();
            if (consume(TokenType::Equals)) {
                return parse_assignment(name);
            }
            if (consume(TokenType::LParen)) {
                // 带显式参数列表的层调用
                auto call = parse_layer_call_after_name(name);
                if (!call) return nullptr;
                return std::make_unique<AstAssignment>("", std::move(call));
            }
            // 顺序模式下的无参数层调用（例如 relu, tanh, flatten）
            return std::make_unique<AstAssignment>("", std::make_unique<AstLayerCall>(name, std::vector<AstArgument>{}));
        }
        if (error_.empty()) {
            error_ = "unexpected token " + current_.text + " at line " + std::to_string(current_.line);
        }
        return nullptr;
    }

    AstStatementPtr Parser::parse_input_statement() {
        advance(); // 跳过 'input'
        auto stmt = std::make_unique<AstAssignment>("", nullptr);
        if (current_.type == TokenType::Identifier) {
            stmt->lhs = current_.text;
            advance();
            if (!consume(TokenType::Equals)) {
                if (error_.empty()) error_ = "expected = after input variable name at line " + std::to_string(current_.line);
                return nullptr;
            }
        }
        auto shape = parse_shape();
        if (shape.empty() && !error_.empty()) return nullptr;

        auto call = std::make_unique<AstLayerCall>("input", std::vector<AstArgument>{});
        call->args.push_back(AstArgument{"shape", std::move(shape)});
        stmt->rhs = std::move(call);
        return stmt;
    }

    AstStatementPtr Parser::parse_assignment(const std::string& name) {
        auto expr = parse_expression();
        if (!expr) return nullptr;
        return std::make_unique<AstAssignment>(name, std::move(expr));
    }

    AstStatementPtr Parser::parse_return_statement() {
        advance(); // 跳过 'return'
        auto ret = std::make_unique<AstReturn>();
        while (current_.type == TokenType::Identifier) {
            ret->names.push_back(current_.text);
            advance();
            if (current_.type == TokenType::Comma) {
                advance();
            } else {
                break;
            }
        }
        return ret;
    }

    AstExpressionPtr Parser::parse_expression() {
        auto left = parse_layer_or_identifier();
        if (!left) return nullptr;
        while (current_.type == TokenType::Arrow) {
            advance(); // 跳过 ->
            if (!expect(TokenType::Identifier, "layer name after ->")) return nullptr;
            std::string layer_name = current_.text;
            advance();
            if (consume(TokenType::LParen)) {
                auto tail = parse_layer_call_after_name(layer_name);
                if (!tail) return nullptr;
                auto chained = std::make_unique<AstLayerCall>(tail->layer_type, std::move(tail->args));
                for (auto& in : tail->inputs) {
                    chained->inputs.push_back(std::move(in));
                }
                chained->inputs.push_back(std::move(left));
                left = std::move(chained);
            } else {
                // 链式调用中的无参数层
                auto chained = std::make_unique<AstLayerCall>(layer_name, std::vector<AstArgument>{});
                chained->inputs.push_back(std::move(left));
                left = std::move(chained);
            }
        }
        return left;
    }

    AstExpressionPtr Parser::parse_layer_or_identifier() {
        if (!expect(TokenType::Identifier, "layer or identifier")) return nullptr;
        std::string name = current_.text;
        advance();
        if (consume(TokenType::LParen)) {
            return parse_layer_call_after_name(name);
        }
        return std::make_unique<AstIdentifier>(name);
    }

    AstLayerCallPtr Parser::parse_layer_call_after_name(const std::string& type) {
        auto args = parse_argument_list();
        if (!error_.empty()) return nullptr;
        if (!expect(TokenType::RParen, ")") || !consume(TokenType::RParen)) return nullptr;
        auto call = std::make_unique<AstLayerCall>(type, std::move(args));
        // 可选显式输入：layer(...)(input1, input2, ...)
        if (consume(TokenType::LParen)) {
            while (current_.type != TokenType::RParen && current_.type != TokenType::Eof) {
                auto input = parse_layer_or_identifier();
                if (!input) return nullptr;
                call->inputs.push_back(std::move(input));
                if (current_.type == TokenType::Comma) {
                    advance();
                } else if (current_.type == TokenType::RParen) {
                    break;
                } else {
                    if (error_.empty()) error_ = "expected , or ) in input list at line " + std::to_string(current_.line);
                    return nullptr;
                }
            }
            if (!expect(TokenType::RParen, ")") || !consume(TokenType::RParen)) return nullptr;
        }
        return call;
    }

    std::vector<AstArgument> Parser::parse_argument_list() {
        std::vector<AstArgument> args;
        while (current_.type != TokenType::RParen && current_.type != TokenType::Eof) {
            // 命名参数检测：标识符后跟 '='
            if (current_.type == TokenType::Identifier) {
                // 无法预读下一个 token，因此保存当前 token、前进后检查是否为 '='。
                std::string name = current_.text;
                Token saved = current_;
                advance();
                if (consume(TokenType::Equals)) {
                    AstArgument arg;
                    arg.name = name;
                    arg.value = parse_value();
                    if (!error_.empty()) return {};
                    args.push_back(std::move(arg));
                    if (current_.type == TokenType::Comma) {
                        advance();
                    } else if (current_.type == TokenType::RParen) {
                        break;
                    } else {
                        if (error_.empty()) error_ = "expected , or ) in argument list at line " + std::to_string(current_.line);
                        return {};
                    }
                    continue;
                } else {
                    // 不是命名参数：恢复并作为位置参数值解析。由于无法预读，advance 已消费下一个 token，当前实现直接返回错误（标识符应作为 bool/string/enum 值）。
                    if (error_.empty()) error_ = "unexpected identifier '" + name + "' at line " + std::to_string(saved.line);
                    return {};
                }
            }
            AstArgument arg;
            arg.value = parse_value();
            if (!error_.empty()) return {};
            args.push_back(std::move(arg));
            if (current_.type == TokenType::Comma) {
                advance();
            } else if (current_.type == TokenType::RParen) {
                break;
            } else {
                if (error_.empty()) error_ = "expected , or ) in argument list at line " + std::to_string(current_.line);
                return {};
            }
        }
        return args;
    }

    ParamValue Parser::parse_value() {
        if (current_.type == TokenType::IntLiteral) {
            int v = std::stoi(current_.text);
            advance();
            return v;
        }
        if (current_.type == TokenType::FloatLiteral) {
            double v = std::stod(current_.text);
            advance();
            return v;
        }
        if (current_.type == TokenType::BoolLiteral) {
            bool v = current_.text == "true";
            advance();
            return v;
        }
        if (current_.type == TokenType::StringLiteral) {
            std::string v = current_.text;
            advance();
            return v;
        }
        if (current_.type == TokenType::LParen) {
            return parse_shape();
        }
        if (error_.empty()) {
            error_ = "expected value at line " + std::to_string(current_.line);
        }
        return {};
    }

    std::vector<int> Parser::parse_shape() {
        std::vector<int> shape;
        if (!expect(TokenType::LParen, "(") || !consume(TokenType::LParen)) return {};
        while (current_.type != TokenType::RParen && current_.type != TokenType::Eof) {
            if (current_.type == TokenType::IntLiteral) {
                shape.push_back(std::stoi(current_.text));
                advance();
            } else if (current_.type == TokenType::Minus) {
                advance();
                if (!expect(TokenType::IntLiteral, "1 after -")) return {};
                shape.push_back(-1);
                advance();
            } else {
                if (error_.empty()) error_ = "expected integer in shape at line " + std::to_string(current_.line);
                return {};
            }
            if (current_.type == TokenType::Comma) {
                advance();
            } else if (current_.type == TokenType::RParen) {
                break;
            } else {
                if (error_.empty()) error_ = "expected , or ) in shape at line " + std::to_string(current_.line);
                return {};
            }
        }
        if (!expect(TokenType::RParen, ")") || !consume(TokenType::RParen)) return {};
        return shape;
    }
}