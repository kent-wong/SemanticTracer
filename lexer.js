const fs = require('fs');
const TokenEnum = require('./interpreter');

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

	isDigit(c) {
		if (c >= '0' && c <= '9') {
			return true;
		}
		return false;
	}

	isCIdentStart(c) {
		return this.isAlpha(c) || c === '_' || c === '#';
	}

	isCIdent(c) {
		return this.isAlpha(c) || this.isDigit(c) || c === '_';
	}

	/* 从代码中获取一个Token，用于代码扫描过程 */
	scanToken() {
		const thisChar;

		while (this.pos !== this.end && this.isSpace(this.source[this.pos])) {
			if (this.source[this.pos] === '\n') {
				this.pos ++;
				this.line ++;
				this.column = 0;

				return TokenEnum.TokenEndOfLine;
			}
		}

		if (this.pos === this.end) {
			return TokenEnum.TokenEOF;
		}

		thisChar = this.sourcep[this.pos];
		if (this.isCIdentStart(thisChar)) {
		}
	}
}

//console.log(ReservedWords['abc'] === undefined);
const lexer = new Lexer('test.c');
console.log(lexer.isDigit('6'));
console.log(lexer.isAlpha('6'));
