const assert = require('assert');
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
        this.typedefs = new Map();

        this.lexer = new Lexer(filename);
        this.lexer.tokenize();

        /*
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
        */

        this.structNameCounter = 1000;

        this.astRoot = {
            astType: Ast.AstStatementBlock,
            astBlock: []
        };

        this.current = this.astRoot;
    }

    stateSave() {
        return {tokenIndex: this.lexer.tokenIndex};
    }

    stateRestore(parserInfo) {
        this.lexer.tokenIndex = parserInfo.tokenIndex;
    }

    getTokenInfo() {
        return this.lexer.getTokenInfo();
    }

    peekTokenInfo() {
        return this.lexer.peekTokenInfo();
    }

    getToken() {
        return this.lexer.getToken();
    }

    peekToken() {
        return this.lexer.peekToken();
    }

    forwardTokenIf(token) {
        return this.lexer.forwardTokenIf(token);
    }

    forwardTokenIf2(token1, token2) {
        return this.lexer.forwardTokenIf2(token1, token2);
    }

    makeStructName() {
        const name = String(this.structNameCounter) + '_struct_name';
        this.structNameCounter ++;
        return name;
    }

    /* 解析并返回类型的AST，如果解析失败返回NULL
     * AST结构定义：
     *  {
     *      astBaseType - BaseType枚举类型；
     *      numPtrs - 此类型后面紧跟的*号数目；
     *  }
     */
    parseType() {
        let token = Token.TokenNone;
        let ident = null;
        let isUnsigned = false;
        const resultType = {
            astBaseType: null,
            numPtrs: 0
        };

        // 首先处理自定义类型
        ({token, ident} = this.peekTokenInfo());
        if (token === Token.TokenIdentifier) {
            const astTypedef = this.typedefs.get(ident);

            // 解析指针
            this.getToken();
            while (this.forwardTokenIf(Token.TokenAsterisk)) {
                resultType.numPtrs ++;
            }

            return astTypedef;
        }

        // 跳过这几种类型
        while (this.forwardTokenIf(Token.TokenStaticType, Token.TokenAutoType, 
                    Token.TokenRegisterType, Token.TokenExternType)) {
        }

        token = this.getToken();
        if (token in [Token.TokenSignedType, Token.TokenUnsignedType]) {
            const nextToken = this.peekToken();
            isUnsigned = (token === Token.TokenUnsignedType);

            if (nextToken !== Token.IntType && nextToken !== Token.CharType &&
                    nextToken !== Token.ShortType && nextToken !== Token.LongType) {
                if (isUnsigned) {
                    resultType.astBaseType = this.UnsignedIntType;
                } else {
                    resultType.astBaseType = this.IntType;
                }

                return resultType;
            }

            token = this.getToken();
        }

        switch(token) {
            case Token.TokenIntType:
                resultType.astBaseType = isUnsigned ? BaseType.TypeUnsignedInt : BaseType.TypeInt;
                break;
            case Token.TokenShortType:
                resultType.astBaseType = isUnsigned ? BaseType.TypeUnsignedShort: BaseType.TypeShort;
                break;
            case Token.TokenCharType:
                resultType.astBaseType = isUnsigned ? BaseType.TypeUnsignedChar : BaseType.TypeChar;
                break;
            case Token.TokenLongType:
                resultType.astBaseType = isUnsigned ? BaseType.TypeUnsignedLong : BaseType.TypeLong;
                break;
            case Token.TokenFloatType:
            case Token.TokenDoubleType:
                resultType.astBaseType = BaseType.TypeFP;
                break;
            case Token.TokenVoidType:
                resultType.astBaseType = BaseType.TypeVoid;
                break;
            case Token.TokenStructType:
                ({token, ident} = this.getTokenInfo());
                if (token !== Token.TokenIdentifier) {
                    platform.programFail(`expected struct name`);
                }
                resultType.astBaseType = BaseType.TypeStruct;
                resultType.ident = ident;
                break;
            case Token.TokenUnionType:
                // todo
                break;
            case Token.TokenEnumType:
                resultType = this.parseTypeEnum();
                break;
            default:
                break;
        }

        // 解析指针
        while (this.forwardTokenIf(Token.TokenAsterisk)) {
            resultType.numPtrs ++;
        }

        if (resultType.astBaseType === null) {
            resultType = null;
        }

        return resultType;
    } // end of parseType()

    parseStruct() {
        let token = Token.TokenNone;
        let structName = null;

        token = this.peekToken();
        if (token === Token.TokenIdentifier) {
            // 获取struct名字
            ({token, structName} = this.getTokenInfo());
            token = this.peekToken();
        } else {
            // 为此struct生成一个名字
            structName = this.makeStructName();
            makeupName = true;
        }

        /*
        const structType = {
            astBaseType: BaseType.TypeStruct,
            ident: structName,
            members: []
        };

        if (token !== Token.TokenLeftBrace) {
            if (makeupName) {
                platform.programFail(`expected struct name`);
            }
            return structType; // 不是struct定义语句
        }
        */
        
        // 本函数只解析struct的完整定义
        if (token !== Token.TokenLeftBrace) {
            return null;
        }

        const astStructDef = {
            astType: Ast.AstStruct,
            ident: structName,
            members: []
        };

        let astMember = null;
        this.getToken();
        do {
            astMember = this.parseDeclaration();
            if (this.getToken() !== Token.TokenSemicolon) {
                platform.programFail(`missing ';' after declaration`);
            }
            
            // 生成struct的member
            if (Array.isArray(astMember)) {
                for (let v in astMember) {
                    astStructDef.members.push(v);
                }
            } else {
                astStructDef.members.push(v);
            }
        } while (this.peekToken() !== Token.TokenRightBrace);
        this.getToken();

        return astStructDef;
    } // end of parseStruct()

    parseTypedef() {
        const astType = this.parseType();
        if (astValueType === null) {
            platform.programFail(`expected a type here`);
        }

        const {token, ident} = this.getTokenInfo();
        if (token !== Token.TokenIdentifier) {
            platform.programFail(`need a identifier here, instead got token type ${token}`);
        }

        const astTypedefs = {
            astType: Ast.AstTypedef,
            origin: astType,
            ident: ident
        };
        this.typedefs.set(ident, astTypedefs);

        return astTypedefs;
    }

    /* 解析声明语句，返回AST */
    parseDeclaration(...stopAt) {
        const astList = [];
        let token, value;
        const astValueType = this.parseType();
        if (valueType === null) {
            platform.programFail(`internal error: parseDeclaration(${firstToken}): parseType()`);
        }

        do {
            // 由声明语句生成的AST
            const astDecl = {
                astType: Ast.AstDeclaration,
                valueType: astValueType,
                ident: null,
                arrayIndexes: [],
                rhs: null
            };

            ({token, value} = this.getTokenInfo());
            if (token !== Token.TokenIdentifier) {
                platform.programFail(`need a identifier here, instead got token type ${token}`);
            }

            astDecl.ident = value;

            // 处理数组下标
            while (this.forwardTokenIf(Token.TokenLeftSquareBracket)) {
                let astIndex = this.parseExpression(Token.TokenRightSquareBracket);
                astDecl.arrayIndexes.push(astIndex);
                this.getToken();
            }

            // 处理赋值
            if (this.forwardTokenIf(Token.TokenAssign)) {
                let rhs = this.parseExpression(Token.TokenComma);
                astDecl.rhs = rhs;
            }

            // 添加到当前语句块
            astList.push(astDecl);

            token = this.peekToken();
            if (token in stopAt) {
                break;
            }
        } while (this.forwardTokenIf(Token.TokenComma));

        return astList;
    } // end of parseDeclaration(...stopAt)

    retrieveIdentAst() {
        let token = Token.TokenNone;
        let value = null;
        let done = false;
        let refByPtr = false;
        let astResult = null;

        do {
            ({token, value} = this.getTokenInfo());
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
    parseAssignment(lhs, assignType) {
        const astAssign = {
            astType: Ast.AstAssign,
            lhs: lhs,
            assignType: assignType,
            rhs: this.parseExpression(Token.TokenComma)
        };

        return astAssign;
    }

    parseExpression(...stopAt) {
        if (stopAt.length === 0) {
            // 表达式默认以分号结尾
            stopAt.push(Token.TokenSemicolon);
        }

        let token = this.peekToken();
        let value = null;
        let elementList = [];
        let astResult = null;
        let astNextExpression = null;

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

        token = this.peekToken();
        do {
            // 检查是否为函数调用
            if (this.forwardTokenIf2(Token.TokenIdentifier, Token.TokenOpenParenth)) {
                // todo
                token = this.peekToken();
                continue;
            }

            if (token === Token.TokenIdentifier) {
                let astIdent = this.retrieveIdentAst();
                if (astIdent === null) {
                    platform.programFail(`expect an identifier here`);
                }
                elementList.push(astIdent); // 放入表达式元素列表
            } else if (token >= Token.TokenQuestionMark && token <= Token.TokenCast) {
                const astOperator = {
                    astType: Ast.AstOperator,
                    token: token
                };
                elementList.push(astOperator); // 放入表达式元素列表
                this.getToken();
            } else if (token >= Token.TokenIntegerConstant && token <= Token.TokenCharacterConstant) {
                ({token, value} = this.getTokenInfo());
                const astConstant = {
                    astType: Ast.AstConstant,
                    token: token,
                    value: value
                };
                elementList.push(astOperator); // 放入表达式元素列表
            } else if (this.forwardTokenIf(Token.TokenOpenParenth)) {
                astResult = this.parseExpression(Token.TokenCloseParenth);
                elementList.push(astOperator); // 放入表达式元素列表
                this.getToken();
            } else if (this.forwardTokenIf(Token.TokenComma)) {
                // 如果逗号不是解析停止符号，将产生表达式AST链表
                astNextExpression = this.parseExpression(stopAt);
            } else if (token === Token.TokenEOF) {
                platform.programFail(`incomplete expression`);
            } else if (token === Token.TokenSemicolon) { 
                // 表达式解析不能跨越分号
                // 如果分号在指定的停止符号之前出现，说明这是错误的语法
                if (!(Token.TokenSemicolon in stopAt)) {
                    platform.programFail(`expected '${Token.getTokenName(stopAt[0])}' before ';' token `);
                }
            } else {
                platform.programFail(`unrecognized token type ${Token.getTokenName(token)}`);
            }

            token = this.peekToken();
        } while (!(token in stopAt));
    
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
        elementList.reverse().forEach((v, idx, arr) => {
            if (v.astType !== Ast.AstOperator) {
                return ;
            }
            const prevIdx = idx + 1;
            const nextIdx = idx - 1;
            const prevAst = arr[prevIdx];
            const nextAst = arr[nextIdx];
            const astType = null;

            switch (v.token) {
                case Token.TokenAmpersand:
                    if (nextAst === undefined || nextAst.astType !== Ast.AstIdentifier) {
                        platform.programFail(`lvalue is required here`);
                    }
                    astType = Ast.AstTakeAddress;
                    break;
                case Token.TokenAsterisk:
                    if ((prevAst === undefined || prevAst === Ast.AstOperator) &&
                            nextAst !== undefined && nextAst !== Ast.AstOperator) {
                        astType = Ast.AstTakeValue;
                    }
                    break;
                case Token.TokenMinus:
                    if ((prevAst === undefined || prevAst === Ast.AstOperator) &&
                            nextAst !== undefined && nextAst !== Ast.AstOperator) {
                        astType = Ast.AstUMinus;
                    }
                    break;
                case Token.TokenUnaryNot:
                    if (nextAst === undefined || nextAst.astType === Ast.AstOperator) {
                        platform.programFail(`value is required after unary not`);
                    }
                    astType = Ast.AstUnaryNot;
                    break;
                default:
                    astType = null;
                    break;
            }

            if (astType !== null) {
                arr[idx] = {
                    astType: astType,
                    token: v.token,
                    astIdent: arr[nextIdx]
                };
                arr[nextIdx] = undefined;
            }
        });
        elementList = elementList.reverse().filter(v => {return v !== undefined});

        // 将表达式元素打包为一个AST
        const astExpression = {
            astType: Ast.AstExpression,
            elementList: elementList,
            next: astNextExpression
        };

        return astExpression;
    } // end of parseExpression(stopAt)

    /* 解析一条语句，返回此语句对应的AST
     * 语句有一下几种类型：
     * 1、声明语句，包括变量声明，函数定义
     * 2、表达式语句，包括赋值，函数调用，算数/逻辑表达式等
     * 3、struct/union/enum/typedef用户自定义类型语句
     * 4、if...else/for/while/do...while/switch等控制语句
     * 5、语句块
     */
    parseStatement() {
        const [firstToken, firstValue] = this.peekToken();
        let astResult = null;

        switch (firstToken) {
            case Token.TokenSemicolon:
                // 如果此语句只有分号，直接返回null
                this.getToken();
                break;

            case Token.Identifier:
                if (this.typedefs.get(firstValue) !== undefined) {
                    // identifier是由typedef定义的自定义类型
                    astResult = this.parseDeclaration();
                    if (this.getToken() !== Token.TokenSemicolon) {
                        platform.programFail(`missing ';' after declaration`);
                    }

                    return astResult;
                } // 否则按expression处理
            case TokenAsterisk:
            case TokenAmpersand:
            case TokenIncrement:
            case TokenDecrement:
            case TokenOpenParenth:
                astResult = this.parseExpression();
                if (this.getToken() !== Token.TokenSemicolon) {
                    platform.programFail(`missing ';' after expression`);
                }
                break;
                
            case TokenLeftBrace:
                this.getToken();
                astResult = this.parseBlock(Token.TokenRightBrace);
                this.getToken();
                break;

            // 解析控制语句 
            case TokenIf:
                this.getToken();
                astResult = this.parseIf();
                break;
            case TokenWhile:
                this.getToken();
                astResult = this.parseWhile();
                break;
            case TokenDo:
                this.getToken();
                astResult = this.parseDoWhile();
                break;
            case TokenFor:
                this.getToken();
                astResult = this.parseFor();
                break;
            case TokenSwitch:
                this.getToken();
                astResult = this.parseSwitch();
                break; 

            // 下列为以类型开始的语句，按照声明语句来解析(包括函数定义)
            case TokenStructType:
                const structTokenInfo = this.getTokenInfo();
                const oldState = this.stateSave();
                this.getToken();

                const astStructDef = this.parseStruct();
                if (astStructDef !== null) {
                    // 在完整的struct定义之后如果没有立即出现';'
                    // 说明此struct可能被马上用来声明变量，例如：
                    //  struct foo {
                    //    int bar;
                    //  }s1, s2[10];
                    // 
                    // 这种情况下一条语句会产生两个AST
                    // 为了解决这个问题，在struct完整定义后立即插入两个token：
                    // <TokenStructType, TokenIdentifier>并返回
                    // 这样将一条语句分成了两条语句，下次再解析的时候会进行声明语句的处理
                    if (!this.forwardTokenIf(Token.TokenSemicolon)) {
                        const nameTokenInfo = this.lexer.makeTokenInfo(Token.TokenIdentifier,
                                                                            astStructDef.ident,
                                                                            this.lexer.tokenIndex(),
                                                                            this.lexer.tokenIndex());
                        this.lexer.insertTokens(structTokenInfo, nameTokenInfo);
                    }
                    return astStructDef;
                }

                this.stateRestore(oldState);
                // fall-through
            case TokenIntType:
            case TokenShortType:
            case TokenCharType:
            case TokenLongType:
            case TokenFloatType:
            case TokenDoubleType:
            case TokenVoidType:
            case TokenUnionType:
            case TokenEnumType:
            case TokenSignedType:
            case TokenUnsignedType:
            case TokenStaticType:
            case TokenAutoType:
            case TokenRegisterType:
            case TokenExternType:
                astResult = this.parseDeclaration();
                if (this.getToken() !== Token.TokenSemicolon) {
                    platform.programFail(`missing ';' after declaration`);
                }
                break;
               
            case TokenTypedef:
                astResult = this.parseTypedef();
                if (this.getToken() !== Token.TokenSemicolon) {
                    platform.programFail(`missing ';' after typedef`);
                }
                break; 

            case TokenGoto:
                break; 

            default:
                break;
        }

        return astResult;
    } // end of parseStatement()

    createAstBlock() {
        return {
            astType: astBlock,
            array: [],
            push: function(astStatement) {
                return this.array.push(astStatement);
            }
        };
    }

    parseBlock(...stopAt) {
        let token = Token.TokenNone;
        const astBlock = createAstBlock();

        /*
        if (!skipFirstToken) {
            assert(this.getToken() === Token.TokenLeftBrace, `parseBlock(): first token is NOT TokenLeftBrace`);
            this.getToken();
        }
        */

        do {
            let astStatement = this.parseStatement();
            /* 由parseStatement()检查分号
            if (!this.forwardTokenIf(Token.TokenSemicolon)) {
                platform.programFail(`missing ';' after statement`);
            }
            */

            if (astStatement !== null) {
                astBlock.push(astStatement);
            }

            token = this.peekToken();
        } while (!(token in stopAt));

        return astBlock;
    }
    
    parseBody() {
        let astBlock = null;

        if (this.forwardTokenIf(Token.TokenLeftBrace)) {
            astBlock = this.parseBlock(Token.TokenRightBrace);
        } else {
            const statement = this.parseStatement();
            if (statement !== null) {
                astBlock = this.createAstBlock();
                astBlock.push(statement);
            }

        }
        this.getToken();

        return astBlock;
    }

    parseWhile() {
        let token = Token.TokenNone;
        let conditional = null;
        let astWhile = {
            astType: Ast.AstWhile,
            conditional: null,
            body: null
        };

        /*
        if (!skipFirstToken) {
            assert(this.getToken() === Token.TokenWhile, `parseWhile(): first token is NOT TokenWhile`);
        }
        */

        if (!this.forwardTokenIf(Token.TokenOpenParenth)) {
            platform.programFail(`'(' expected`);
        }

        token = this.peekToken();
        if (token !== Token.TokenCloseParenth) {
            conditional = this.parseExpression(Token.TokenCloseParenth);
            astWhile.conditional = conditional;
            this.getToken();
        } else {
            platform.programFail(`expected expression before ')' token`);
        }

        astWhile.body = this.parseBody();

        return astWhile;
    } // end of parseWhile()

    parseDoWhile() {
        let token = Token.TokenNone;
        const astDoWhile = {
            astType: Ast.AstDoWhile,
            conditional: null,
            body: null
        };

        /*
        if (!skipFirstToken) {
            assert(this.getToken() === Token.TokenDo, `parseDoWhile(): first token is NOT TokenDo`);
        }
        */

        token = this.peekToken();
        if (token !== Token.TokenLeftBrace) {
            platform.programFail(`missing '{' after do keyword`);
        }

        astDoWhile.body = this.parseBlock(Token.TokenRightBrace);
        this.getToken();
        if (!this.forwardTokenIf(Token.TokenWhile)) {
            platform.programFail(`missing while keyword after '}'`);
        }

        if (!this.forwardTokenIf(Token.TokenOpenParenth)) {
            platform.programFail(`'(' expected`);
        }

        token = this.peekToken();
        if (token !== Token.TokenCloseParenth) {
            let conditional = this.parseExpression(Token.TokenCloseParenth);
            astDoWhile.conditional = conditional;
            this.getToken();
        } else {
            platform.programFail(`expected expression before ')' token`);
        }

        return astDoWhile;
    }

    parseFor() {
        let initial = null;
        let conditional = null;
        let finalExpression = null;

        const body = {
            astType: Ast.AstFor,
            initial: null,
            conditional: null,
            finalExpression: null,
            block: null
        };

        /*
        if (!skipFirstToken) {
            assert(this.getToken() === Token.TokenFor, `parseFor(): first token is NOT TokenFor`);
        }
        */

        if (!this.forwardTokenIf(Token.TokenOpenParenth)) {
            platform.programFail(`'(' expected`);
        }

        initial = this.parseStatement();
        conditional = this.parseStatement();
        finalExpression = this.parseExpression(Token.TokenCloseParenth);

        assert(this.getToken(), Token.TokenCloseParenth, `parseFor(): ')' is expected`);

        body.initial = initial;
        body.conditional = conditional;
        body.finalExpression = finalExpression;
        body.block = this.parseBody();
        
        return body;
    }

    parseSwitch() {
        let token = Token.TokenNone;
        let conditional = null;

        const astSwitch = {
            astType: Ast.AstSwitch,
            conditional: null,
            cases: [],
            default: null,
            pushCase: function(expression, block) {
                this.cases.push({
                    expression: expression,
                    block: block
                });
            }
        };

        if (!this.forwardTokenIf(Token.TokenOpenParenth)) {
            platform.programFail(`'(' expected`);
        }

        token = this.peekToken();
        if (token !== Token.TokenCloseParenth) {
            conditional = this.parseExpression(Token.TokenCloseParenth);
            astSwitch.conditional = conditional;
            this.getToken();
        } else {
            platform.programFail(`expected expression before ')' token`);
        }

        if (!this.forwardTokenIf(Token.TokenLeftBrace)) {
            platform.programFail(`'{' expected`);
        }

        while (this.forwardTokenIf(Token.TokenCase)) {
            let expression = this.parseExpression(Token.TokenColon);
            this.getToken();
            let block = this.parseBlock(Token.TokenCase, Token.TokenDefault, Token.TokenRightBrace);
            astCase.push(caseBlock);
        }

        if (this.forwardTokenIf(Token.TokenDefault)) {
            if (this.getToken() !== Token.TokenColon) {
                platform.programFail(`':' expected`);
            }

            let block = this.parseBlock(Token.TokenCase, Token.TokenDefault, Token.TokenRightBrace);
            astCase.default = block;

            // 这里不允许case语句出现在default之后
            if (token === Token.TokenCase) {
                platform.programFail(`you should always put 'case label' before 'default label'`);
            }

            if (token == Token.TokenDefault) {
                platform.programFail(`multiple default labels in one switch`);
            }
        }

        token = this.getToken();

        return astCase;
    } // end of parseSwitch()

    parseIf() {
        let token = Token.TokenNone;
        let conditional = null;

        const astIf = {
            astType: Ast.AstIf,
            conditional: null,
            ifBranch: null,
            elseBranch: null
        };

        if (!this.forwardTokenIf(Token.TokenOpenParenth)) {
            platform.programFail(`'(' expected`);
        }

        token = this.peekToken();
        if (token !== Token.TokenCloseParenth) {
            conditional = this.parseExpression(Token.TokenCloseParenth);
            astIf.conditional = conditional;
            this.getToken();
        } else {
            platform.programFail(`expected expression before ')' token`);
        }

        astIf.ifBranch = this.parseBody();

        // 处理else分支
        if (this.forwardTokenIf(Token.TokenElse)) {
            if (this.forwardTokenIf(Token.TokenIf)) {
                // 如果else后面是if，则递归调用本函数再次解析if...else语句
                astIf.elseBranch = this.parseIf();
            } else {
                // 解析语句或者语句块
                astIf.elseBranch = this.parseBody();
            }
        }

        return astIf;
    } // end of parseIf()

    // 解析函数定义/声明中的参数
    parseParams() {
        const paramList = [];
        let hasParamName = true;

        // 先检查一下是否有参数
        if (this.forwardTokenIf(Token.TokenCloseParenth)) {
            return [];
        }

        do {
            const astParamType = this.parseType();
            if (astParamType === null) {
                platform.programFail(`expected a parameter type`);
            }

            // 参数的AST
            const astParam = {
                astType: Ast.AstParam,
                paramType: astParamType,
                ident: null,
                arrayIndexes: []
            };

            // 函数声明中参数可以没有名字
            if (this.peekToken() === Token.TokenComma) {
                hasParamName = false;
                paramList.push(astParam);
                continue ;
            }

            let {token, paramName} = this.getTokenInfo();
            if (token !== Token.TokenIdentifier) {
                platform.programFail(`expected an identifier, but got token ${Token.getTokenName(token)}`);
            }

            astParam.ident = paramName;

            // 处理数组下标
            while (this.forwardTokenIf(Token.TokenLeftSquareBracket)) {
                let astIndex = this.parseExpression(Token.TokenRightSquareBracket);
                astParam.arrayIndexes.push(astIndex);
                this.getToken();
            }

            // 添加到参数AST列表
            paramList.push(astParam);
        } while (this.forwardTokenIf(Token.TokenComma));

        if (!this.forwardTokenIf(Token.TokenCloseParenth)) {
            platform.programFail(`expected ',' or ')'`);
        }

        return paramList;
    } // end of parseParams() 

    parseFuncDef() {
        const returnType = this.parseType();

        const astFuncDef = {
            astType: Ast.AstFuncDef,
            name: null,
            params: [],
            body: null,
            returnType: returnType
        };

        let {token, funcName} = this.getTokenInfo();

        assert(token, Token.TokenIdentifier, `parseFuncDef(): expected identifier but got '${Token.getTokenName(token)}'`);

        token = this.getToken();
        assert(token, Token.TokenOpenParenth, `parseFuncDef(): expected '(' but got '${Token.getTokenName(token)}'`);

        astFuncDef.name = funcName;
        astFuncDef.params = this.parseParams();
        astFuncDef.body = this.parseBody();

        return astFuncDef;
    } // end of parseFuncDef()






}

const parser = new Parser('./test.c');
