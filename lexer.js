const fs = require('fs');
const Token = require('./interpreter');
const Identifier = require('./identifier');

const ReservedWords = {
	"#define": Token.TokenHashDefine,
    "#else": Token.TokenHashElse,
    "#endif": Token.TokenHashEndif,
    "#if": Token.TokenHashIf,
    "#ifdef": Token.TokenHashIfdef,
    "#ifndef": Token.TokenHashIfndef,
    "#include": Token.TokenHashInclude,
    "auto": Token.TokenAutoType,
    "break": Token.TokenBreak,
    "case": Token.TokenCase,
    "char": Token.TokenCharType,
    "continue": Token.TokenContinue,
    "default": Token.TokenDefault,
    "delete": Token.TokenDelete,
    "do": Token.TokenDo,
    "double": Token.TokenDoubleType,
    "else": Token.TokenElse,
    "enum": Token.TokenType,
    "extern": Token.TokenExternType,
    "float": Token.TokenFloatType,
    "for": Token.TokenFor,
    "goto": Token.TokenGoto,
    "if": Token.TokenIf,
    "int": Token.TokenIntType,
    "long": Token.TokenLongType,
    "new": Token.TokenNew,
    "register": Token.TokenRegisterType,
    "return": Token.TokenReturn,
    "short": Token.TokenShortType,
    "signed": Token.TokenSignedType,
    "sizeof": Token.TokenSizeof,
    "static": Token.TokenStaticType,
    "struct": Token.TokenStructType,
    "switch": Token.TokenSwitch,
    "typedef": Token.TokenTypedef,
    "union": Token.TokenUnionType,
    "unsigned": Token.TokenUnsignedType,
    "void": Token.TokenVoidType,
    "while": Token.TokenWhile
};

class Lexer {
	constructor(filename) {
		this.source = fs.readFileSync(filename, 'utf8');
		this.filename = filename;
		this.line = 1;
		this.column = 1;
		this.pos = 0
		this.end = this.source.length;
	}

	checkReservedWord(word) {
		if (ReservedWords[word] !== undefined) {
			return ReservedWords[word];
		}

		return Token.TokenNone;
	}

	increment(n) {
		if (n === undefined) {
			n = 1;
		}
		this.pos += n;
		this.column += n;
	}

	isSpace(c) {
		if (c === ' ' || c === '\t' || c === '\r'
				|| c === '\n' || c === '\v' || c === '\f') {
			return true;
		}
		return false;
	}

	isAlpha(c) {
		if (c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z') {
			return true;
		}
		return false;
	}

	isHexAlpha(c) {
		if (c >= 'a' && c <= 'f' || c >= 'A' && c <= 'F') {
			return true;
		}
		return false;
	}

	isDigit(c, base) {
		const n = parseInt(c);

		if (base === undefined) {
			base = 10;
		}

		if (base !== 2 && base !== 8 && base !== 10 && base !== 16) {
			throw new Error(`isDigit(): base ${base} is invalid!`);
		}

		if (c.length !== 1) {
			throw new Error(`only one character allowed!`);
		}

		const upper = base < 10 ? base : 10;
		if (n >= 0 && n < upper) {
			return true;
		}

		if (base === 16) {
			return this.isHexAlpha(c);
		}

		return false;
	}

	isCIdentStart(c) {
		return this.isAlpha(c) || c === '_' || c === '#';
	}

	isCIdent(c) {
		return this.isAlpha(c) || this.isDigit(c) || c === '_';
	}

    ifThen(c, x, y) {
        if (c === this.getChar()) {
            this.increment();
            return x;
        }
        return y;
    }

    ifThen2(c, x, d, y, z) {
        if (c === this.getChar()) {
            this.increment();
            return x;
        }
        return this.ifThen(d, y, z);
    }

    ifThen3(c, x, d, y, e, z, a) {
        if (c === this.getChar()) {
            this.increment();
            return x;
        }
        return this.ifThen2(d, y, e, z, a);
    }

    ififThen(c, d, x, y) {
        if (c === this.getChar() && d === this.getChar(1)) {
            this.increment(2);
            return x;
        }
        return y;
    }

	getChar(n) {
		if (n === undefined) {
			n = 0;
		}

		if (n >= this.end) {
            return 0;
		}

		return this.source[n];
	}

    getNextChar() {
        return this.getChar(1);
    }

	/* 从当前扫描位置获取一个identifier，此identifier可能是保留关键字，也可能是变量名 
	 * 此函数有两个返回值: 1. Token 2. identifier string(null for reserved words)
	 * */
	getWord() {
		let word = '';
		const startIndex = this.pos;

		do {
			this.increment(1);
		} while (this.pos !== this.end && this.isCIdent(this.source[this.pos]));

		word = this.source.substring(startIndex, this.pos);
		Identifier.store(word);

		// wk_debug
		console.log('debug:getWord():', word);

		const token = this.checkReservedWord(word);
		if (token !== Token.TokenNone) {
			return [token, null];
		}

		return [Token.TokenIdentifier, word];
	}

	getNumber() {
		let base = 10;
		let result = 0;

		if (this.getChar() === '0') {
			this.increment();
			if (this.pos !== this.end) {
				if (this.getChar() === 'x' || this.getChar() === 'X') {
					base = 16;
					this.increment();
				} else if (this.getChar() === 'b' || this.getChar() === 'B') {
					base = 2;
					this.increment();
				} else if (this.getChar() !== '.') {
					base = 8;
					this.increment();
				}
			}
		}

		while (this.pos !== this.end && this.isDigit(this.getChar(), base)) {
            result = result * base + parseInt(this.getChar(), base);
			this.increment();
		}

        // fixit: quick and dirty
        if (this.getChar() === 'u' || this.getChar() === 'U') {
            this.increment();
        }

        if (this.getChar() === 'l' || this.getChar() === 'L') {
            this.increment();
        }

        if (this.getChar() === 'l' || this.getChar() === 'L') {
            this.increment();
        }

        // 如果不是小数或者科学计数法就直接返回
        if (this.pos === this.end
            || this.getChar() !== '.' && this.getChar() !== 'e' && this.getChar() !== 'E') {
            return [Token.TokenIntegerConstant, result];
        }

        // 处理小数部分
        if (this.getChar() === '.') {
            this.increment();
            let fpdiv = 1.0 / base;

            while (this.pos !== this.end && this.isDigit(this.getChar(), base)) {
                result += parseInt(this.getChar(), base) * fpdiv;
                fpdiv /= base;
                this.increment();
            }
        }

        // 处理指数部分
        if (this.pos !== this.end && (this.getChar() === 'e' || this.getChar() === 'E')) {
            let expSign = 1;
            let expResult = 0;

            this.increment();
            if (this.pos !== this.end && this.getChar() === '-') {
                expSign = -1;
                this.increment();
            }

            while (this.pos !== this.end && this.isDigit(this.getChar(), base)) {
                expResult = expResult * base + parseInt(this.getChar(), base);
                this.increment();
            }

            result *= Math.pow(base, expResult*expSign);
        }
        
        if (this.getChar() === 'f' || this.getChar() === 'F') {
            this.increment();
        }

        return [Token.TokenFPConstant, result];
	}

	/* 从代码中获取一个Token，用于代码扫描过程 */
	scanToken() {
        let GotToken = Token.TokenNone;

		while (this.pos !== this.end && this.isSpace(this.getChar())) {
			if (this.getChar() === '\n') {
				this.pos ++;
				this.line ++;
				this.column = 0;

				return Token.TokenEndOfLine;
			}
		}

		if (this.pos === this.end) {
			return Token.TokenEOF;
		}

		if (this.isCIdentStart(this.getChar())) {
            return this.getWord();
		}

        if (this.isDigit(this.getChar())) {
            return this.getNumber();
        }

        const lastChar = this.getChar();
        this.increment();
        switch (lastChar) {
            case '"':
                GotToken = this.getStringConstant('"');
                break;
            case '\'':
                GotToken = this.getCharacterConstant();
                break;
            case '(':
                GotToken = Token.TokenOpenBracket;
                break;
            case ')':
                GotToken = Token.TokenCloseBracket;
                break;
            case '=':
                GotToken = this.ifThen('=', Token.TokenEqual, Token.TokenAssign);
                break;
            case '+':
                GotToken = this.ifThen2('=', Token.TokenAddAssign, '+', Token.TokenIncrement,
                                            Token.TokenPlus);
                break;
            case '-':
                GotToken = this.ifThen3('=', Token.TokenSubtractAssign, '>', Token.TokenArrow,
                                            '-', Token.TokenDecrement, Token.TokenMinus);
                break;
            case '*':
                GotToken = this.ifThen('=', Token.TokenMultiplyAssign, Token.TokenAsterisk);
                break;
            case '/':
                if (this.getChar() === '/' || this.getChar() === '*') {
                    this.increment();
                    this.skipComment();
                } else {
                    GotToken = this.ifThen('=', Token.TokenDivideAssign, Token.TokenSlash);
                }
                break;
            case '%':
                GotToken = this.ifThen('=', Token.TokenModulusAssign, Token.TokenModulus);
                break;
            case '<':
                if (this.getChar() === '<' && this.getNextChar() === '=') {
                    GotToken = Token.TokenShiftLeftAssign;
                } else {
                    GotToken = this.ifThen2('=', Token.TokenLessEqual, '<',
                                                Token.TokenShiftLeft, Token.TokenLessThan);
                }
                break;
            case '>':
                if (this.getChar() === '>' && this.getNextChar() === '=') {
                    GotToken = Token.TokenShiftRightAssign;
                } else {
                    GotToken = this.ifThen2('=', Token.TokenGreaterEqual, '>',
                                                Token.TokenShiftRight, Token.TokenGreaterThan);
                }
                break;
            case ';':
                GotToken = Token.TokenSemicolon;
                break;
            case '&':
                GotToken = this.ifThen2('=', Token.TokenArithmeticAndAssign, '&',
                                                Token.TokenLogicalAnd, Token.TokenAmpersand);
                break;
            case '|':
                GotToken = this.ifThen2('=', Token.TokenArithmeticOrAssign, '|',
                                                Token.TokenLogicalOr, Token.TokenArithmeticOr);
                break;
            case '{':
                GotToken = TokenLeftBrace;
                break;
            case '}':
                GotToken = TokenRightBrace;
                break;
            case '[':
                GotToken = TokenLeftSquareBracket;
                break;
            case ']':
                GotToken = TokenRightSquareBracket;
                break;
            case '!':
                GotToken = this.ifThen('=', Token.TokenNotEqual, Token.TokenUnaryNot);
        }
	}
}

//console.log(ReservedWords['abc'] === undefined);
const lexer = new Lexer('test.c');
console.log(lexer.isDigit('6'));
console.log(lexer.isAlpha('6'));
