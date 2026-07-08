#pragma once

#include <string>
#include <vector>

namespace vek {
    enum class TokenType {
        // 字面量
        IntLiteral,
        FloatLiteral,
        StringLiteral,
        BoolLiteral,
        // 标识符 / 关键字
        Identifier,
        Network, // 关键字
        Block, // 关键字
        Input, // 关键字
        Return, // 关键字
        // 分隔符
        LParen, // (
        RParen, // )
        LBrace, // {
        RBrace, // }
        Comma, // ,
        Equals, // =
        Arrow, // ->
        Minus, // -
        Eof
    };

    struct Token {
        TokenType type;
        std::string text;
        int line = 0;
    };

    class Lexer {
    public:
        explicit Lexer(std::string source) : source_(std::move(source)) {}

        Token next_token();
        const std::string& error() const { return error_; }

    private:
        std::string source_;
        size_t pos_ = 0;
        int line_ = 1;
        std::string error_;

        void skip_whitespace();
        void skip_line_comment();
        void skip_block_comment();
        Token identifier_or_keyword();
        Token number_literal();
        Token string_literal();
    };
}