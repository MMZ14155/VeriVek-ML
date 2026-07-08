#pragma once

#include "ir.h"
#include "lexer.h"

#include <memory>
#include <string>
#include <vector>

namespace vek {
    // AST 节点前向声明
    struct AstNetwork;
    struct AstBlock;
    struct AstStatement;
    struct AstExpression;
    struct AstLayerCall;
    struct AstArgument;

    using AstStatementPtr = std::unique_ptr<AstStatement>;
    using AstExpressionPtr = std::unique_ptr<AstExpression>;
    using AstLayerCallPtr = std::unique_ptr<AstLayerCall>;

    struct AstNode {
        virtual ~AstNode() = default;
    };

    struct AstStatement : AstNode {
        virtual ~AstStatement() = default;
    };

    struct AstArgument {
        std::string name; // 位置参数时为空
        ParamValue value;
    };

    struct AstExpression : AstNode {
        virtual ~AstExpression() = default;
    };

    struct AstIdentifier : AstExpression {
        std::string name;
        explicit AstIdentifier(std::string n) : name(std::move(n)) {}
    };

    struct AstLayerCall : AstExpression {
        std::string layer_type;
        std::vector<AstArgument> args;
        std::vector<AstExpressionPtr> inputs; // 顺序模式下为空
        AstLayerCall(std::string type, std::vector<AstArgument> a)
            : layer_type(std::move(type)), args(std::move(a)) {}
    };

    struct AstChained : AstExpression {
        AstExpressionPtr head;
        AstLayerCallPtr tail;
        AstChained(AstExpressionPtr h, AstLayerCallPtr t)
            : head(std::move(h)), tail(std::move(t)) {}
    };

    struct AstAssignment : AstStatement {
        std::string lhs;
        AstExpressionPtr rhs;
        AstAssignment(std::string name, AstExpressionPtr expr)
            : lhs(std::move(name)), rhs(std::move(expr)) {}
    };

    struct AstReturn : AstStatement {
        std::vector<std::string> names;
    };

    struct AstNetwork : AstNode {
        std::string name;
        std::vector<AstStatementPtr> body;
    };

    struct AstBlock : AstNode {
        std::string name;
        std::vector<std::string> params;
        std::vector<std::string> defaults; // 带默认值参数，尚未实现
        std::vector<AstStatementPtr> body;
    };

    struct AstProgram : AstNode {
        std::vector<std::unique_ptr<AstBlock>> blocks;
        std::vector<std::unique_ptr<AstNetwork>> networks;
    };

    class Parser {
    public:
        explicit Parser(std::string source);

        std::unique_ptr<AstProgram> parse(); // 解析 Vek 源代码为 AST
        const std::string& error() const { return error_; } // 获取解析错误信息

    private:
        Lexer lexer_;
        Token current_;
        std::string error_;

        void advance();
        bool expect(TokenType type, const std::string& what);
        bool consume(TokenType type);

        std::unique_ptr<AstProgram> parse_program();
        std::unique_ptr<AstNetwork> parse_network();
        std::unique_ptr<AstBlock> parse_block();
        AstStatementPtr parse_statement();
        AstStatementPtr parse_input_statement();
        AstStatementPtr parse_assignment(const std::string& name);
        AstStatementPtr parse_return_statement();
        AstExpressionPtr parse_expression();
        AstExpressionPtr parse_chain_expression();
        AstExpressionPtr parse_layer_or_identifier();
        AstLayerCallPtr parse_layer_call_after_name(const std::string& type);
        std::vector<AstArgument> parse_argument_list();
        ParamValue parse_value();
        std::vector<int> parse_shape();
    };
}