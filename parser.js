const Token = require('./interpreter');
const BaseType = require('./basetype');
const ValueType = require('./valuetype');
const Value = require('./value');
const Lexer = require('./lexer');
const Scopes = require('./scopes');

class Parser {
    constructor(filename) {
        this.scopes = new Scopes();

        this.lexer = new Lexer(filename);
        this.lexer.tokenize();

        this.IntType = new ValueType(BaseType.TypeInt);
        this.CharType = new ValueType(BaseType.TypeChar);
        this.ShortType = new ValueType(BaseType.TypeShort);
        this.LongType = new ValueType(BaseType.TypeLong);

        this.UnsignedIntType = new ValueType(BaseType.TypeUnsignedInt);
        this.UnsignedCharType = new ValueType(BaseType.TypeUnsignedChar);
        this.UnsignedShortType = new ValueType(BaseType.TypeUnsignedShort);
        this.UnsignedLongType = new ValueType(BaseType.TypeUnsignedLong);

        this.VoidType = new ValueType(BaseType.TypeVoid);
        this.FunctionType = new ValueType(BaseType.TypeFunction);
        this.MacroType = new ValueType(BaseType.TypeMacro);
        this.GotoLabelType = new ValueType(BaseType.TypeGotoLabel);
        this.FPType = new ValueType(BaseType.TypeFP);
        this.TypeType = new ValueType(BaseType.Type_Type);

        //this.CharArrayType = new ValueType();
        this.CharPtrType = new ValueType(BaseType.TypePointer, this.CharType);
        this.CharPtrPtrType = new ValueType(BaseType.TypePointer, this.CharPtrType);
        this.VoidPtrType = new ValueType(BaseType.TypePointer, this.VoidType);
    }

    stateSave() {
        return {tokenIndex: this.lexer.tokenIndex};
    }

    stateRestore(parserInfo) {
        this.lexer.tokenIndex = parserInfo.tokenIndex;
    }

    parseTypeFront() {
        const oldState = this.stateSave();
        let token = Token.TokenNone;
        let isUnsigned = false;
        let resultType = null;

        token = this.lexer.getToken();
        while (token === Token.TokenStaticType || token === Token.TokenAutoType ||
                token === Token.TokenRegisterType || token === Token.TokenExternType) {
            token = this.lexer.getToken();
        }

        if (token === Token.TokenSignedType || token === Token.TokenUnsignedType) {
            const nextToken = this.lexer.peekToken();
            isUnsigned = (token === Token.TokenUnsignedType);

            if (nextToken !== Token.IntType && nextToken !== Token.CharType &&
                    nextToken !== Token.ShortType && nextToken !== Token.LongType) {
                if (isUnsigned) {
                    return this.UnsignedIntType;
                } else {
                    return this.IntType;
                }
            }

            token = this.lexer.getToken();
        }




    } // end of parseTypeFront()






}

const parser = new Parser('./test.c');
