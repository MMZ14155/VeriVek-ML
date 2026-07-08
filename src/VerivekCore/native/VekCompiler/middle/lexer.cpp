#include "lexer.h"

#include <cctype>

namespace vek {
    namespace {
        bool is_alpha(char c) { return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c == '_'; }
        bool is_digit(char c) { return c >= '0' && c <= '9'; }
        bool is_alnum(char c) { return is_alpha(c) || is_digit(c); }
        bool is_space(char c) { return c == ' ' || c == '\t' || c == '\r' || c == '\n'; }
    }

    void Lexer::skip_whitespace() {
        while (pos_ < source_.size() && is_space(source_[pos_])) {
            if (source_[pos_] == '\n') ++line_;
            ++pos_;
        }
    }

    Token Lexer::identifier_or_keyword() {
        size_t start = pos_;
        while (pos_ < source_.size() && is_alnum(source_[pos_])) ++pos_;
        std::string text = source_.substr(start, pos_ - start);
        TokenType type = TokenType::Identifier;
        if (text == "network") type = TokenType::Network;
        else if (text == "block") type = TokenType::Block;
        else if (text == "input") type = TokenType::Input;
        else if (text == "return") type = TokenType::Return;
        else if (text == "true" || text == "false") type = TokenType::BoolLiteral;
        return Token{type, text, line_};
    }

    Token Lexer::number_literal() {
        size_t start = pos_;
        while (pos_ < source_.size() && is_digit(source_[pos_])) ++pos_;
        if (pos_ < source_.size() && source_[pos_] == '.') {
            ++pos_;
            while (pos_ < source_.size() && is_digit(source_[pos_])) ++pos_;
            return Token{TokenType::FloatLiteral, source_.substr(start, pos_ - start), line_};
        }
        return Token{TokenType::IntLiteral, source_.substr(start, pos_ - start), line_};
    }

    Token Lexer::string_literal() {
        size_t start = ++pos_;
        while (pos_ < source_.size() && source_[pos_] != '"') {
            if (source_[pos_] == '\n') ++line_;
            ++pos_;
        }
        if (pos_ >= source_.size()) {
            error_ = "unterminated string literal at line " + std::to_string(line_);
            return Token{TokenType::Eof, "", line_};
        }
        std::string text = source_.substr(start, pos_ - start);
        ++pos_; // 跳过右引号
        return Token{TokenType::StringLiteral, text, line_};
    }

    void Lexer::skip_line_comment() {
        while (pos_ < source_.size() && source_[pos_] != '\n') ++pos_;
    }

    void Lexer::skip_block_comment() {
        pos_ += 2; // 跳过 /*
        while (pos_ + 1 < source_.size() && !(source_[pos_] == '*' && source_[pos_ + 1] == '/')) {
            if (source_[pos_] == '\n') ++line_;
            ++pos_;
        }
        if (pos_ + 1 >= source_.size()) {
            error_ = "unterminated block comment at line " + std::to_string(line_);
        } else {
            pos_ += 2; // 跳过 */
        }
    }

    Token Lexer::next_token() {
        if (!error_.empty()) return Token{TokenType::Eof, "", line_};
        skip_whitespace();
        if (pos_ >= source_.size()) return Token{TokenType::Eof, "", line_};

        char c = source_[pos_];

        if (c == '#') { skip_line_comment(); return next_token(); }
        if (c == '/' && pos_ + 1 < source_.size() && source_[pos_ + 1] == '*') { skip_block_comment(); return next_token(); }

        if (is_alpha(c)) return identifier_or_keyword();
        if (is_digit(c)) return number_literal();

        switch (c) {
            case '"': return string_literal();
            case '(': ++pos_; return Token{TokenType::LParen, "(", line_};
            case ')': ++pos_; return Token{TokenType::RParen, ")", line_};
            case '{': ++pos_; return Token{TokenType::LBrace, "{", line_};
            case '}': ++pos_; return Token{TokenType::RBrace, "}", line_};
            case ',': ++pos_; return Token{TokenType::Comma, ",", line_};
            case '=': ++pos_; return Token{TokenType::Equals, "=", line_};
            case '-':
                if (pos_ + 1 < source_.size() && source_[pos_ + 1] == '>') {
                    pos_ += 2;
                    return Token{TokenType::Arrow, "->", line_};
                }
                ++pos_;
                return Token{TokenType::Minus, "-", line_};
        }

        error_ = "unexpected character '" + std::string(1, c) + "' at line " + std::to_string(line_);
        return Token{TokenType::Eof, "", line_};
    }
}