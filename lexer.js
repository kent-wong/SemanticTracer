const fs = require('fs');
const Token = require('./interpreter');
const assert = require('assert');
const Identifier = require('./identifier');
const platform = require('./platform');

const MacroStatus = {
    Normal: 0,
    PendingHash: 1,
    HashDefine: 2,
    HashDefineIdent: 3
};

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
		this.pos = 0;
		this.end = this.source.length;
        this.tokenInfo = null;
        this.tokenIndex = 0;

        // 扫描过程中的宏定义状态
        this.macroStatus = MacroStatus.Normal;

        // 上一次扫描出的token
        this.lastToken = Token.TokenNone;

        // 宏定义
        this.macroDefs = new Map();
	}

    doScanMacro() {
        const macro = [];

        while (this.tokenInfo[this.tokenIndex].token !== Token.TokenEOF) {
            if (this.tokenInfo[this.tokenIndex].token === Token.TokenEndOfLine) {
                if (macro.length === 0) {
                    this.fail(`no macro name given in #define directive`);
                }
                this.tokenIndex ++;
                return macro;
            }

            macro.push(this.tokenInfo[this.tokenIndex ++]);
        }

        platform.programFail(`reach EOF before the end of macro`);
        return ;
    }

    processMacros() {
        let macroName;
        let macroTokens;
        let macroDef;
        let newRound = true;
        
        while (this.tokenInfo[this.tokenIndex].token !== Token.TokenEOF) {
            while (this.tokenInfo[this.tokenIndex].token === Token.TokenHashDefine) {
                let start = this.tokenIndex;
                this.tokenIndex ++;

                macroTokens = this.doScanMacro();
                macroDef = this.parseMacro(macroTokens);
                this.macroDefs.set(macroDef.name, macroDef);

                // 删除宏定义
                this.tokenInfo.splice(start, this.tokenIndex - start);
                this.tokenIndex = start;
            }

            newRound = true;
            while (this.tokenInfo[this.tokenIndex].token === Token.TokenIdentifier &&
                        this.macroDefs.get(this.tokenInfo[this.tokenIndex].value) !== undefined) {
                macroDef = this.macroDefs.get(this.tokenInfo[this.tokenIndex].value);

                // 清空上一轮的宏扩展记录
                if (newRound) {
                    newRound = false;
                    for (let v of this.macroDefs.values()) {
                        v.used = false;
                    }
                }

                if (macroDef.used) {
                    break;
                }

                // 进行宏扩展
                let start = this.tokenIndex;
                let replaced = this.expandMacro(macroDef);
                this.tokenInfo.splice(start, this.tokenIndex - start, ...replaced);

                // 每个宏定义最多只能扩展一次，防止宏扩展死循环
                macroDef.used = true;
                this.tokenIndex = start;
            }

            this.tokenIndex ++;
        }

        // 重置token索引
        this.tokenIndex = 0;
        return;
    }

    parseMacroParams(macro) {
        const params = [];
        let gotIdent = false;
        let tokenInfo = macro.shift();

        if (tokenInfo.token === Token.TokenCloseParenth) {
            return [];
        }

        do {
            if (gotIdent) {
                if (tokenInfo.token !== Token.TokenComma) {
                    platform.programFail(`expected ',' or ')'`);
                }
            } else {
                if (tokenInfo.token !== Token.TokenIdentifier) {
                    platform.programFail(`expected parameter name`);
                }

                params.push(tokenInfo);
                gotIdent = true;
            }

            let tokenInfo = macro.shift();
        } while (tokenInfo !== undefined && tokenInfo.token !== Token.TokenCloseParenth);

        if (tokenInfo === undefined) {
            platform.programFail('incomplete macro parameters');
        }

        return params;
    }

    parseMacro(macro) {
        if (macro[0].token !== Token.TokenIdentifier) {
            platform.programFail(`expected macro name after #define directive`);
        }

        const macroDef = {
            name: macro[0].value,
            params: [],
            body: null,
            used: false
        };

        macro.shift();
        if (macro.length !== 0 && macro[0].token === Token.TokenOpenMacroParenth) {
            macro.shift();
            macroInfo.params = parseMacroParams(macro);
            macro.shift();
        }

        if (macro.length === 0) {
            platform.programFail(`macro definition has no body`);
        }

        macroDef.body = macro;
        return macroDef;
    }

    parseMacroArgs() {
        const stack = [];
        const args = [];
        let curArg = [];

        while (this.tokenInfo[this.tokenIndex].token !== Token.TokenEOF) {
            switch (this.tokenInfo[this.tokenIndex].token) {
                case Token.TokenOpenParenth:
                    stack.push(Token.TokenOpenParenth);
                    curArg.push(this.tokenInfo[this.tokenIndex]);
                    break;
                case Token.TokenCloseParenth:
                    if (stack.length !== 0) {
                        stack.pop();
                        curArg.push(this.tokenInfo[this.tokenIndex]);
                    } else {
                        return args;
                    }
                    break;
                case Token.TokenComma:
                    if (stack.length !== 0) {
                        curArg.push(this.tokenInfo[this.tokenIndex]);
                    } else {
                        args.push(curArg);
                        curArg = [];
                    }
                    break;
                default:
                    curArg.push(this.tokenInfo[this.tokenIndex]);
                    break;
            }

            this.tokenIndex ++;
        }
        platform.programFail('incomplete macro arguments');
    }

    expandMacro(macroDef) {
        const hasArg = false;
        const hasParam = false;

        this.tokenIndex ++;
        if (this.tokenInfo[this.tokenIndex].token === Token.TokenOpenParenth) {
            hasArg = true;
        }

        if (macroDef.params.length !== 0) {
            hasParam = true;
        }

        // 如果宏定义有参数，但是代码中只出现宏名称而没有参数，
        // 则不进行宏展开
        if (hasParam) {
            if (!hasArg) {
                return null;
            } else {
                // 实参替换掉形参
                this.tokenIndex ++;
                let args = this.parseMacroArgs();
                this.tokenIndex ++;

                // 实参和形参的数目必须相等
                if (macroDef.params.length !== args.length) {
                    platform.programFail(`macro "${macroDef.name}" requires ${macroDef.params.length} arguments, but ${args.length} is given`);
                }

                let newBody = macroDef.body.concat();
                for (let i = 0, len = newBody.length; i < len; i ++) {
                    if (newBody[i].token === Token.TokenIdentifier &&
                            newBody[i].value in macroDef.params) {
                        newBody.splice(i, 1, ...args[i]);
                        i += args[i].length - 1;
                    }
                }

                return newBody;
            }
        } else {
            // 宏没有参数
            return macroDef.body.concat();
        }
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
		return this.isAlpha(c) || c === '_';
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

		if ((this.pos + n) >= this.end) {
            return 0;
		}

		return this.source[this.pos + n];
	}

    getNextChar() {
        return this.getChar(1);
    }

    // todo
    fail(message) {
        console.log(message);
        process.exit(1);
    }

	getWord() {
		let word = '';
		const startIndex = this.pos;

		do {
			this.increment();
		} while (this.pos !== this.end && this.isCIdent(this.getChar()));

		word = this.source.substring(startIndex, this.pos);
        return word;
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

    /* 将普通字符串转换成C语言字符串 */
    cStringify(str) {
        /* C语言的字符串允许使用'\'后加回车来折行书写，但是'\'和回车不属于字符串本身 */
        const strArray = [...str];
        strArray.map((value, index, arr) => {
            if (value === '\n') {
                if (index > 0 && arr[index-1] === '\\') {
                    arr[index] = undefined;
                    arr[index-1] = undefined;
                }
                if (index > 1 && arr[index-1] === '\r' && arr[index-2] === '\\') {
                    arr[index] = undefined;
                    arr[index-1] = undefined;
                    arr[index-2] = undefined;
                }
            }
            return value;
        });

        /* 将字面转义字符转换成相应的字符，
         * 例如：将长度为2的字符串"\n"转换成单字符'\n'
         * */
        strArray.map((value, index, array) => {
            if (index === 0 || array[index-1] !== '\\') {
                return value;
            }
            switch (value) {
                case '\\':
                case '\'':
                case '\"':
                    break;
                case 'a':
                    array[index] = '\a';
                    break;
                case 'b':
                    array[index] = '\b';
                    break;
                case 'f':
                    array[index] = '\f';
                    break;
                case 'n':
                    array[index] = '\n';
                    break;
                case 'r':
                    array[index] = '\r';
                    break;
                case 't':
                    array[index] = '\t';
                    break;
                case 'v':
                    array[index] = '\v';
                    break;
                default:
                    break;
            }

            array[index-1] = undefined;
        });

        return strArray.join('');
    }

    getStringConstant(endChar) {
        let esc = false;
        const start = this.pos;

        while (this.pos !== this.end && (this.getChar() !== endChar || esc)) {
            if (esc) {
                esc = false;
                if (this.getChar() === '\n') {
                    this.line ++;
                    this.column = 1;
                }
            } else if (this.getChar() === '\\') {
                esc = true;
            }
            this.increment();
        }

        const str = this.source.substring(start, this.pos);
        if (this.pos === this.end) {
            this.fail(`missing '"' at the end of string ${str}`);
        }

        this.increment();
        return this.cStringify(str);
    }

    getCharacterConstant() {
        let esc = false;
        const start = this.pos;
        const endChar = '\'';

        while (this.pos !== this.end && (this.getChar() !== endChar || esc)) {
            if (esc) {
                esc = false;
                if (this.getChar() === '\n') {
                    this.line ++;
                    this.column = 1;
                }
            } else if (this.getChar() === '\\') {
                esc = true;
            }
            this.increment();
        }

        const str = this.source.substring(start, this.pos);
        if (this.pos === this.end) {
            this.fail(`missing "'" at the end of character ${str}`);
        }

        this.increment();
        const charStr = this.cStringify(str);
        if (charStr.length !== 1) {
            this.fail(`'${charStr}' is NOT a character`);
        }

        return charStr;
    }

    skipComment(style) {
        if (style === '*') {
            while (this.pos !== this.end && (this.getChar(-1) !== '*' || this.getChar() !== '/')) {
                if (this.getChar() === '\n') {
                    this.line ++;
                    this.column = 1;
                }
                this.increment();
            }
        } else {
            while (this.pos !== this.end && this.getChar() !== '\n') {
                this.increment();
            }
        }

        if (this.pos === this.end) {
            this.fail(`missing end of comment`);
        }
        this.increment();
    }

    skipLineCont() {
        while (this.pos !== this.end && this.getChar() !== '\n') {
            this.increment();
        }

        if (this.pos === this.end) {
            this.fail(`missing end of line continuation`);
        }
        this.increment();
    }

	/* 从代码中获取一个Token，用于代码扫描过程 */
	scanToken() {
        let GotToken = Token.TokenNone;
        let GotValue = null;
        let pendingHash = false;

        do {
            // 去掉line continuation
            let i = 1;
            while (this.getChar() === '\\') {
                while (this.getChar(i) === ' ' || this.getChar(i) === '\t') {
                    i ++;
                }

                if (this.getChar(i) === '\n') {
                    this.increment(i+1);
                } else if (this.getChar(i) === '\r' && this.getChar(i+1) === '\n') {
                    this.increment(i+2);
                } else {
                    break;
                }
            }

            while (this.pos !== this.end && this.isSpace(this.getChar())) {
                if (this.getChar() === '\n') {
                    this.pos ++;
                    this.line ++;
                    this.column = 1;

                    if (this.macroStatus === MacroStatus.PendingHash) {
                        this.fail(`invalid symbol #`);
                    }

                    this.macroStatus = MacroStatus.Normal;
                    return [Token.TokenEndOfLine, null];
                } else if (this.macroStatus === MacroStatus.HashDefineIdent) {
                    this.macroStatus = MacroStatus.Normal;
                }

                this.increment();
            }

            if (this.pos === this.end) {
                return [Token.TokenEOF, null];
            }

            if (this.isCIdentStart(this.getChar())) {
                const word = this.getWord();
                
                switch (this.macroStatus) {
                    case MacroStatus.PendingHash:
                        // 当前只支持#define
                        if (this.checkReservedWord('#' + word) === Token.TokenHashDefine) {
                            this.macroStatus = MacroStatus.HashDefine;
                            return [Token.TokenHashDefine, null];
                        }
                        this.fail(`unsupported preprocessing directive #${word}`);
                        break;
                    case MacroStatus.HashDefine:
                        this.macroStatus = MacroStatus.HashDefineIdent;
                        return [Token.TokenIdentifier, word];
                    default:
                        let reservedWord = this.checkReservedWord(word);
                        if (reservedWord !== Token.TokenNone) {
                            return [reservedWord, null];
                        }
                        return [Token.TokenIdentifier, word];
                }
            } else if (this.macroStatus === MacroStatus.HashDefine) {
                this.fail(`macro names must be identifiers`);
            }

            if (this.isDigit(this.getChar())) {
                return this.getNumber();
            }

            const lastChar = this.getChar();
            this.increment();
            switch (lastChar) {
                case '"':
                    GotToken = Token.TokenStringConstant;
                    GotValue = this.getStringConstant('"');
                    break;
                case '\'':
                    GotToken = Token.TokenCharacterConstant;
                    GotValue = this.getCharacterConstant();
                    break;
                case '(':
                    if (this.macroStatus === MacroStatus.HashDefineIdent) {
                        GotToken = Token.TokenOpenMacroParenth;
                    } else {
                        GotToken = Token.TokenOpenParenth;
                    }
                    this.macroStatus = MacroStatus.Normal;
                    break;
                case ')':
                    GotToken = Token.TokenCloseParenth;
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
                        this.skipComment(this.getChar());
                    } else {
                        GotToken = this.ifThen('=', Token.TokenDivideAssign, Token.TokenSlash);
                    }
                    break;
                case '%':
                    GotToken = this.ifThen('=', Token.TokenModulusAssign, Token.TokenModulus);
                    break;
                case '<':
                    if (this.getChar() === '<' && this.getNextChar() === '=') {
                        this.increment(2);
                        GotToken = Token.TokenShiftLeftAssign;
                    } else {
                        GotToken = this.ifThen2('=', Token.TokenLessEqual, '<',
                                                    Token.TokenShiftLeft, Token.TokenLessThan);
                    }
                    break;
                case '>':
                    if (this.getChar() === '>' && this.getNextChar() === '=') {
                        this.increment(2);
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
                    GotToken = Token.TokenLeftBrace;
                    break;
                case '}':
                    GotToken = Token.TokenRightBrace;
                    break;
                case '[':
                    GotToken = Token.TokenLeftSquareBracket;
                    break;
                case ']':
                    GotToken = Token.TokenRightSquareBracket;
                    break;
                case '!':
                    GotToken = this.ifThen('=', Token.TokenNotEqual, Token.TokenUnaryNot);
                    break;
                case '^':
                    GotToken = this.ifThen('=', Token.TokenArithmeticExorAssign, Token.TokenArithmeticExor);
                    break;
                case '~':
                    GotToken = Token.TokenUnaryExor;
                    break;
                case ',':
                    GotToken = Token.TokenComma;
                    break;
                case '.':
                    if (this.getChar() === '.' && this.getNextChar() === '.') {
                        this.increment(2);
                        GotToken = Token.TokenEllipsis;
                    } else {
                        GotToken = Token.TokenDot;
                    }
                    break;
                case '?':
                    GotToken = Token.TokenQuestionMark;
                    break;
                case ':':
                    GotToken = Token.TokenColon;
                    break;
                /*
                case '\\':
                    if (this.getChar() === ' ' || this.getChar() === '\n') {
                        this.increment();
                        this.skipLineCont(this.getChar());
                    } else {
                        this.fail(`illegal character '${lastChar}'`);
                    }
                    break;
                */
                case '#':
                    if (this.lastToken === Token.TokenNone || this.lastToken === Token.TokenEndOfLine) {
                        this.macroStatus = MacroStatus.PendingHash;
                        GotToken = Token.TokenNone;
                    } else {
                        this.fail(`invalid symbol #`);
                    }
                    break;
                default:
                    this.fail(`illegal character '${lastChar}'`);
                    break;
            }
        } while (GotToken === Token.TokenNone);

        return [GotToken, GotValue];
    } // end of scanToken() 

    tokenize() {
        let token, value, lastPos;
        this.tokenInfo = [];
        this.tokenIndex = 0;
        do {
            lastPos = this.pos;
            [token, value] = this.scanToken();
            this.lastToken = token;

            // 放入队列
            this.tokenInfo.push({token: token, value: value, start: lastPos, end: this.pos});

            // wk_debug
            /*
            console.log(`token:${Token.getTokenName(token)}`);
            if (value !== null && value !== undefined) {
                console.log(`value:${value}`);
            }
            console.log();
            */
        } while (token !== Token.TokenEOF);
    } // end of tokenize()

    // 当前位置插入多个token
    insertTokens(...tokens) {
        assert(tokens.length !== 0, `in function insertTokens(): argument tokens is an empty array`);
        assert(index < this.tokenInfo.length, `in function insertTokens(): argument index overflowed`);

        this.tokenInfo.splice(this.tokenIndex, 0, ...tokens);
    }

    tokenIndex() {
        return this.tokenIndex;
    }

    getTokenInfo(forward) {
        if (forward === undefined) {
            forward = true;
        }

        assert(this.tokenInfo.length !== 0, `lexer scanning is not finished`);
        
        if (this.tokenIndex >= this.tokenInfo.length) {
            return [Token.TokenEOF, null, null, null];
        }

        const tokenInfo = this.tokenInfo[this.tokenIndex];
        if (forward) {
            this.tokenIndex ++;
        }

        return tokenInfo;
    }

    peekTokenInfo() {
        return this.getTokenInfo(false);
    }

    getToken() {
        const tokenInfo = this.getTokenInfo();
        return tokenInfo.token;
    }

    peekToken() {
        const tokenInfo = this.getTokenInfo(false);
        return tokenInfo.token;
    }

    makeTokenInfo(token, value, start, end) {
        return {
            token,
            value,
            start,
            end
        };
    }

    forwardIfMatch(...tokens) {
        let index = this.tokenIndex;
        let token;

        for (let t of tokens) {
            token = (index >= this.tokenInfo.length) ? Token.TokenEOF : this.tokenInfo[index];
            index ++;
            if (Array.isArray(t)) {
                if (!(token in t)) {
                    return false;
                }
            } else if (t !== token) {
                return false;
            }
        }

        this.tokenIndex = index;
        return true;
    }

    peekIfMatch(...tokens) {
        let index = this.tokenIndex;
        let token;

        for (let t of tokens) {
            token = (index >= this.tokenInfo.length) ? Token.TokenEOF : this.tokenInfo[index];
            index ++;
            if (Array.isArray(t)) {
                if (!(token in t)) {
                    return false;
                }
            } else if (t !== token) {
                return false;
            }
        }

        return true;
    }
}

module.exports = Lexer;
