const Token = require('./interpreter');
const BaseType = require('./basetype');
const ValueType = require('./valuetype');
const Value = require('./value');
const Lexer = require('./lexer');
const Scopes = require('./scopes');
const platform = require('./platform');
const Ast = require('./ast');

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

        this.structNameCounter = 1000;
    }

    stateSave() {
        return {tokenIndex: this.lexer.tokenIndex};
    }

    stateRestore(parserInfo) {
        this.lexer.tokenIndex = parserInfo.tokenIndex;
    }

    makeStructName() {
        const name = String(this.structNameCounter) + '_struct_name';
        this.structNameCounter ++;
        return name;
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
                    resultType = this.UnsignedIntType;
                } else {
                    resultType = this.IntType;
                }

                return resultType;
            }

            token = this.lexer.getToken();
        }

        switch(token) {
            case Token.TokenIntType:
                resultType = isUnsigned ? this.UnsignedIntType : this.IntType;
                break;
            case Token.TokenShortType:
                resultType = isUnsigned ? this.UnsignedShortType : this.ShortType;
                break;
            case Token.TokenCharType:
                resultType = isUnsigned ? this.UnsignedCharType : this.CharType;
                break;
            case Token.TokenLongType:
                resultType = isUnsigned ? this.UnsignedLongType : this.LongType;
                break;
            case Token.TokenFloatType:
            case Token.TokenDoubleType:
                resultType = this.FPType;
                break;
            case Token.TokenVoidType:
                resultType = this.VoidType;
                break;
            case Token.TokenStructType:
            case Token.TokenUnionType:
                resultType = this.parseTypeStruct();
                break;
            case Token.TokenEnumType:
                resultType = this.parseTypeEnum();
                break;
            case Token.TokenIdentifier:
                // todo
                break;
            default:
                this.stateRestore(oldState);
        }

        return resultType;
    } // end of parseTypeFront()

    parseTypeBack(valueType) {
    } // end of parseTypeBack()


    parseTypeStruct() {
        let token = Token.TokenNone;
        let structName;

        [token, value] = this.peekTokenValue();
        if (token === Token.TokenIdentifier) {
            // 获取structure名字
            [token, structName] = this.getTokenValue();
            token = this.peekToken();
        } else {
            structName = this.makeStructName();
        }

        let structType = this.scopes.global.getType(structName);
        if (structType === undefined) {
            // 只允许structure在全局命名空间定义
            if (this.scopes.current !== this.scopes.global) {
                platform.programFail(`struct ${structName} is NOT defined in global namespace.`);
            }

            // 添加struct xxxx类型，暂时无成员
            structType = new ValueType(BaseType.TypeStruct, null, 0, structName);
            this.scopes.global.setType(structName, structType);
        }

        if (token !== Token.TokenLeftBrace) {
            // 这里struct可能是已经完整定义的，也可能是forward declaration
            // 也就是说members数组可能为空
            return structType;
        } else if (structType.members.length > 0) {
            platform.programFail(`struct ${structName} is already defined.`);
        }

        this.getToken();

        let memberType, memberIdent;
        do {
            // parse struct member
            [memberType, memberIdent] = this.parseDeclaration();
            //this.handleDeclaration(memberIdent, memberType);
            let value = new Value(memberIdent, memberType);
            structType.members.push(value);
        } while (this.peekToken() !== Token.TokenRightBrace);

        this.getToken();
        return structType;
    } // end of parseTypeStruct()

    parseIdentPart(valueType) {
        let done = false;
        let token, value;
        let oldState;
        let ident = null;

        while (!done) {
            oldState = this.stateSave();
            [token, value] = this.getTokenValue();
            switch (token) {
                // todo
                //case Token.TokenOpenBracket:
                case Token.TokenAsterisk:
                    // 数据类型后面是星号，生成以此数据类型为父类型的指针类型
                    valueType = valueType.makePointerType();
                    break;
                case Token.TokenIdentifier:
                    ident = value;
                    done = true;
                    break;
                default:
                    this.stateRestore(oldState);
                    done = true;
                    break;
            }
        }

        if (valueType === null) {
            platform.programFail(`bad type declaration`);
        }

        if (ident !== null) {
            valueType = this.parseTypeBack(valueType);
        }

        return [valueType, ident];
    } // end of parseIdentPart()

    parseDeclaration() {
    }

    handleDeclaration(ident, type, initValue, isLValue, lvalueFrom) {
        if (this.scopes.current.get(ident) !== undefined) {
            platform.programFail(`${ident} has already been declared.`);
        }

        const value = new Value(ident, type, initValue, isLValue, lvalueFrom);
        this.scopes.current.set(ident, value);
    }




}

const parser = new Parser('./test.c');
