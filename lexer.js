const fs = require('fs');
const TokenEnum = require('./interpreter');
const Identifier = require('./identifier');

const ReservedWords = {
	"#define": TokenEnum.TokenHashDefine,
    "#else": TokenEnum.TokenHashElse,
    "#endif": TokenEnum.TokenHashEndif,
    "#if": TokenEnum.TokenHashIf,
    "#ifdef": TokenEnum.TokenHashIfdef,
    "#ifndef": TokenEnum.TokenHashIfndef,
    "#include": TokenEnum.TokenHashInclude,
    "auto": TokenEnum.TokenAutoType,
    "break": TokenEnum.TokenBreak,
    "case": TokenEnum.TokenCase,
    "char": TokenEnum.TokenCharType,
    "continue": TokenEnum.TokenContinue,
    "default": TokenEnum.TokenDefault,
    "delete": TokenEnum.TokenDelete,
    "do": TokenEnum.TokenDo,
    "double": TokenEnum.TokenDoubleType,
    "else": TokenEnum.TokenElse,
    "enum": TokenEnum.TokenEnumType,
    "extern": TokenEnum.TokenExternType,
    "float": TokenEnum.TokenFloatType,
    "for": TokenEnum.TokenFor,
    "goto": TokenEnum.TokenGoto,
    "if": TokenEnum.TokenIf,
    "int": TokenEnum.TokenIntType,
    "long": TokenEnum.TokenLongType,
    "new": TokenEnum.TokenNew,
    "register": TokenEnum.TokenRegisterType,
    "return": TokenEnum.TokenReturn,
    "short": TokenEnum.TokenShortType,
    "signed": TokenEnum.TokenSignedType,
    "sizeof": TokenEnum.TokenSizeof,
    "static": TokenEnum.TokenStaticType,
    "struct": TokenEnum.TokenStructType,
    "switch": TokenEnum.TokenSwitch,
    "typedef": TokenEnum.TokenTypedef,
    "union": TokenEnum.TokenUnionType,
    "unsigned": TokenEnum.TokenUnsignedType,
    "void": TokenEnum.TokenVoidType,
    "while": TokenEnum.TokenWhile
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

		return TokenEnum.TokenNone;
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

	/* 从当前扫描位置获取一个identifier，此identifier可能是保留关键字，也可能是变量名 
	 * 此函数有两个返回值: 1. TokenEnum 2. identifier string(null for reserved words)
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
		if (token !== TokenEnum.TokenNone) {
			return [token, null];
		}

		return [TokenEnum.TokenIdentifier, word];
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
            return [TokenEnum.TokenIntegerConstant, result];
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

        return [TokenEnum.TokenFPConstant, result];
	}

	/* 从代码中获取一个Token，用于代码扫描过程 */
	scanToken() {
        let GotToken = TokenEnum.TokenNone;

		while (this.pos !== this.end && this.isSpace(this.getChar())) {
			if (this.getChar() === '\n') {
				this.pos ++;
				this.line ++;
				this.column = 0;

				return TokenEnum.TokenEndOfLine;
			}
		}

		if (this.pos === this.end) {
			return TokenEnum.TokenEOF;
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
                GotToken = TokenEnum.TokenOpenBracket;
                break;
        }
	}
}

//console.log(ReservedWords['abc'] === undefined);
const lexer = new Lexer('test.c');
console.log(lexer.isDigit('6'));
console.log(lexer.isAlpha('6'));
