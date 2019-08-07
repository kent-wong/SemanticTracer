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

        this.astRoot = {
            astType: Ast.AstStatements,
            astStatements: []
        };

        this.current = this.astRoot;
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

        if (resultType !== null) {
            while (this.forwardTokenIf(Token.TokenAsterisk)) {
                resultType = resultType.makePointerType();
            }
        }

        return resultType;
    } // end of parseTypeFront()

    parseTypeBack(valueType) {
    } // end of parseTypeBack()


    parseTypeStruct(astList) {
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
            if (token === Token.TokenIdentifier) {
                platform.programFail(`struct ${structName} is NOT defined.`);
            }
            // 添加struct xxxx类型，暂时无成员
            structType = new ValueType(BaseType.TypeStruct, null, 0, structName);
            this.scopes.global.setType(structName, structType);
        }

        if (token !== Token.TokenLeftBrace) {
            return structType; // 不是struct定义语句
        }
        
        // 以下为struct定义处理
        // 只允许structure在全局命名空间定义
        if (this.scopes.current !== this.scopes.global) {
            platform.programFail(`struct ${structName} is NOT defined in global namespace.`);
        }

        if (structType.members.length > 0) {
            platform.programFail(`struct ${structName} is already defined.`);
        }

        // 生成structure对应的AST
        const astStructDef = {
            astType: Ast.AstStruct,
            name: structName,
            astMembers: []
        };

        let astMember = null;
        this.getToken();
        do {
            astMember = this.parseDeclaration(astStructDef.astMembers);
            astStructDef.astMembers.push(astMember);
        } while (this.peekToken() !== Token.TokenRightBrace);

        astList.push(astStructDef);
        this.getToken();
        return structType;
    } // end of parseTypeStruct()

    /* 解析声明语句，返回AST */
    parseDeclaration(astList) {
        let token, value;
        let valueType = this.parseTypeFront();
        if (valueType === null) {
            platform.programFail(`internal error: parseDeclaration(${firstToken}): parseTypeFront()`);
        }

        do {
            // 由此声明语句生成的AST
            const astResult = {
                astType: Ast.AstDeclaration,
                valueType: null,
                ident: null,
                arrayIndexes: [],
                astRHS: null
            };

            [token, value] = this.getTokenValue();
            if (token !== Token.TokenIdentifier) {
                platform.programFail(`need a identifier here, instead got token type ${token}`);
            }

            astResult.valueType = valueType;
            astResult.ident = value;

            // 处理数组下标
            while (this.forwardTokenIf(Token.TokenLeftSquareBracket)) {
                let astIndex = this.parseExpression(Token.TokenRightSquareBracket);
                astResult.arrayIndexes.push(astIndex);
            }

            // 处理赋值
            if (this.forwardTokenIf(Token.TokenAssign)) {
                let astRHS = this.parseExpression(Token.TokenComma);
                astResult.astRHS = astRHS;
            }

            // 添加到当前语句块
            astList.push(astResult);
        } while (this.forwardTokenIf(Token.TokenComma));

        if (!this.forwardTokenIf(Token.TokenSemicolon)) {
            platform.programFail(`missing ";" at the end of declaration statement.`);
        }
    } // end of parseDeclaration(astList)

    retrieveIdentAst() {
        let token = Token.TokenNone;
        let value = null;
        let done = false;
        let refByPtr = false;
        let astResult = null;

        do {
            [token, value] = this.getTokenValue();
            if (token !== Token.TokenIdentifier) {
                return null;
            }

            const astIdent = {
                astType: Ast.AstIdentifier,
                ident: value,
                arrayIndexes: [],
                astParent: astResult,
                refByPtr: refByPtr
            }

            // 处理数组下标
            while (this.forwardTokenIf(Token.TokenLeftSquareBracket)) {
                let astIndex = this.parseExpression(Token.TokenRightSquareBracket);
                astIdent.arrayIndexes.push(astIndex);
            }

            astResult = astIdent; // 把自己设置为parent

            // 处理struct/union成员
            token = this.peekToken();
            if (token === Token.TokenDot || token === Token.TokenArrow) {
                refByPtr = token === Token.TokenDot ? false : true;
                this.getToken();
            } else {
                done = true;
            }
        } while (!done);

        return astResult;
    } // end of retrieveIdentAst()

    // 解析赋值语句，包括=, +=, -=, <<=一类的赋值语句
    parseAssignment(astIdent, assignType) {
        const astAssign = {
            astType: Ast.AstAssign,
            astIdent: astIdent,
            assignType: assignType,
            astRHS: this.parseExpression(Token.TokenComma)
        };

        return astAssign;
    }

    parseExpression(stopAt) {
        let token = this.peekToken();
        let value = null;
        let elementList = [];
        let astResult = null;
        let oldState = this.stateSave();

        if (token === Token.TokenIdentifier) {
            let astIdent = this.retrieveIdentAst();
            if (astIdent === null) {
                platform.programFail(`expect an identifier here`);
            }

            token = this.peekToken();
            if (token >= Token.TokenAssign && token <= Token.TokenArithmeticExorAssign) {
                this.getToken();
                astResult = this.parseAssignment(astIdent, token);
                return astResult;
            }
        }

        this.stateRestore(oldState);
        do {
            // 检查是否为函数调用
            if (this.forwardTokenIf2(Token.TokenIdentifier, Token.TokenOpenBracket)) {
                // todo
                token = this.peekToken();
                continue;
            }

            token = this.peekToken();
            if (token === Token.TokenIdentifier) {
                let astIdent = this.retrieveIdentAst();
                if (astIdent === null) {
                    platform.programFail(`expect an identifier here`);
                }
                elementList.push(astIdent); // 放入表达式元素列表
            } else if (token === Token.TokenAsterisk || token === Token.TokenAmpersand) {
                // todo
            
            } else if (token >= Token.TokenQuestionMark && token <= Token.TokenCast) {
                const astOperator = {
                    astType: Ast.AstOperator,
                    token: token
                };
                elementList.push(astOperator); // 放入表达式元素列表
                this.getToken();
            } else if (token >= Token.TokenIntegerConstant && token <= Token.TokenCharacterConstant) {
                [token, value] = this.getTokenValue();
                const astConstant = {
                    astType: Ast.AstConstant,
                    token: token,
                    value: value
                };
                elementList.push(astOperator); // 放入表达式元素列表
            } else if (token === Token.TokenOpenBracket) {
                astResult = this.parseExpression(Token.TokenCloseBracket);
                elementList.push(astOperator); // 放入表达式元素列表
                this.getToken();
            }

            token = this.peekToken();
        } while (token !== stopAt && token !== Token.TokenComma && token !== Token.TokenSemicolon);
    
        // 处理单目运算符++, --
        elementList.forEach((v, idx, arr) => {
            if (v.astType === Ast.AstOperator &&
                (v.token === Token.TokenIncrement || v.token === Token.TokenDecrement)) {
                if ((idx+1) >= arr.length || arr[idx+1].astType !== Ast.AstIdentifier) {
                    platform.programFail(`lvalue is required here`);
                }
                if ((idx-1) > 0 && arr[idx-1] === undefined) {
                    platform.programFail(`lvalue is required here`);
                }

                arr[idx] = {
                    astType: Ast.AstPrefixOp,
                    token: v.token,
                    astIdent: arr[idx+1]
                };
                arr[idx+1] = undefined;
            } else if (v.astType === Ast.AstIdentifier) {
                if ((idx+1) < arr.length && arr[idx+1].astType === Ast.AstOperator &&
                (arr[idx+1].token == Token.TokenIncrement || arr[idx+1].token == Token.TokenDecrement)) {
                    arr[idx] = {
                        astType: Ast.AstPostfixOp,
                        token: arr[idx+1].token,
                        astIdent: v
                    };
                    arr[idx+1] = undefined;
                }
            }
        });
        elementList = elementList.filter(v => {return v !== undefined});

        // 处理单目运算符-, *, &
        elementList.forEach((v, idx, arr) => {
            if (v.astType === Ast.AstOperator && v.token === Token.TokenAmpersand) {
                if ((idx+1) >= arr.length || arr[idx+1].astType !== Ast.AstIdentifier) {
                    platform.programFail(`lvalue is required here`);
                }

                arr[idx] = {
                    astType: Ast.AstTakeAddress,
                    token: v.token,
                    astIdent: arr[idx+1]
                };
                arr[idx+1] = undefined;
            }

            if (v.astType === Ast.AstOperator && v.token === Token.TokenAsterisk) {
                if (((idx-1) === 0 || ar[idx-1].astType === Ast.AstOperator) &&
                    (idx+1) < arr.length && arr[idx+1] !== Ast.AstOperator) {
                    arr[idx] = {
                        astType: Ast.AstTakeValue,
                        token: v.token,
                        astIdent: arr[idx+1]
                    };
                    arr[idx+1] = undefined;
                }
            }

            if (v.astType === Ast.AstOperator && v.token === Token.TokenMinus) {
                if (((idx-1) === 0 || ar[idx-1].astType === Ast.AstOperator) &&
                    (idx+1) < arr.length && arr[idx+1] !== Ast.AstOperator) {
                    arr[idx] = {
                        astType: Ast.AstUMinus,
                        token: v.token,
                        astIdent: arr[idx+1]
                    };
                    arr[idx+1] = undefined;
                }
            }
        });
        elementList = elementList.filter(v => {return v !== undefined});

        // 将表达式元素打包为一个AST
        const astExpression = {
            astType: Ast.AstExpression,
            elementList: elementList
        };

        return astExpression;
    } // end of parseExpression(stopAt)

    parseStatement(astList) {
    }

    parseStatements(astList) {
    }
    
}

const parser = new Parser('./test.c');
