const assert = require('assert');
const Token = require('./interpreter');
const BaseType = require('./basetype');
const ValueType = require('./valuetype');
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
        this.lexer.processMacros();
        this.lexer.skipEOL();

        // used for generating random struct names
        this.structNameCounter = 1000;

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

    makeStructName() {
        const name = String(this.structNameCounter) + '_struct_name';
        this.structNameCounter ++;
        return name;
    }

    /* 解析并返回类型的AST，如果解析失败返回NULL
     * AST结构定义：
     *  {
     *      baseType - BaseType枚举类型；
     *      numPtrs - 此类型后面紧跟的*号数目；
     *  }
     */
    parseType() {
        let token = Token.TokenNone;
        let customType = null;
        let isUnsigned = false;
        let isUnionType = false;
        let resultType = {
            baseType: null,
            numPtrs: 0,
            customType: null,
            arrayIndexes: []
        };

        // 首先处理自定义类型
        ({token, value: customType} = this.peekTokenInfo());
        if (token === Token.TokenIdentifier) {
            // 由于无法区分自定义类型和普通标识符，所以需要查表来确认
            resultType = this.typedefs.get(customType);
            if (resultType === undefined) {
                return null;
            }
            assert(resultType.astType === Ast.AstTypedef, `internal: parseType(): wrong typedefs astType: ${resultType.astType}`);

            // 解析指针
            this.getToken();

            return resultType.dataType;
        }

        // 跳过这几种类型
        while (this.lexer.forwardIfMatch(Token.TokenStaticType, Token.TokenAutoType, 
                    Token.TokenRegisterType, Token.TokenExternType)) {
        }

        token = this.getToken();
        if ([Token.TokenSignedType, Token.TokenUnsignedType].includes(token)) {
            const nextToken = this.peekToken();
            isUnsigned = (token === Token.TokenUnsignedType);

            if (nextToken !== Token.IntType && nextToken !== Token.CharType &&
                    nextToken !== Token.ShortType && nextToken !== Token.LongType) {
                if (isUnsigned) {
                    resultType.basetype = BaseType.TypeUnsignedInt;
                } else {
                    resultType.basetype = BaseType.TypeInt;
                }

                return resultType;
            }

            token = this.getToken();
        }

        switch(token) {
            case Token.TokenIntType:
                resultType.baseType = isUnsigned ? BaseType.TypeUnsignedInt : BaseType.TypeInt;
                break;
            case Token.TokenShortType:
                resultType.baseType = isUnsigned ? BaseType.TypeUnsignedShort: BaseType.TypeShort;
                break;
            case Token.TokenCharType:
                resultType.baseType = isUnsigned ? BaseType.TypeUnsignedChar : BaseType.TypeChar;
                break;
            case Token.TokenLongType:
                resultType.baseType = isUnsigned ? BaseType.TypeUnsignedLong : BaseType.TypeLong;
                break;
            case Token.TokenFloatType:
            case Token.TokenDoubleType:
                resultType.baseType = BaseType.TypeFP;
                break;
            case Token.TokenVoidType:
                resultType.baseType = BaseType.TypeVoid;
                break;
            case Token.TokenUnionType:
                isUnionType = true;
            case Token.TokenStructType:
                ({token, value: customType} = this.getTokenInfo());
                if (token !== Token.TokenIdentifier) {
                    platform.programFail(`expected struct name`);
                }

                if (isUnionType) {
                    resultType.baseType = BaseType.TypeUnion;
                } else {
                    resultType.baseType = BaseType.TypeStruct;
                }

                resultType.customType = customType;
                break;
            case Token.TokenEnumType:
                ({token, value: customType} = this.getTokenInfo());
                if (token !== Token.TokenIdentifier) {
                    platform.programFail(`expected enum name`);
                }

                resultType.baseType = BaseType.TypeEnum;
                resultType.customType = customType;
                break;
            default:
                break;
        }

        /*
        // 解析指针
        while (this.lexer.forwardIfMatch(Token.TokenAsterisk)) {
            resultType.numPtrs ++;
        }
        */

        if (resultType.baseType === null) {
            resultType = null;
        }

        return resultType;
    } // end of parseType()

    parseEnum(enumName) {
        const astEnumDef = {
            astType: Ast.AstEnum,
            name: enumName,
            members: []
        };

        let tokenInfo = this.lexer.peekTokenInfo();
        if (tokenInfo.token === Token.TokenRightBrace) {
            platform.programFail('empty enum is invalid');
        }

        do {
            tokenInfo = this.lexer.getTokenInfo();
            if (tokenInfo.token !== Token.TokenIdentifier) {
                platform.programFail('expected identifier');
            }

            const member = {
                id: tokenInfo.value,
                value: null
            };

            if (this.lexer.forwardIfMatch(Token.TokenAssign)) {
                this.checkIntegerExpression(member.id, Token.TokenComma, Token.TokenRightBrace);
                member.value = this.parseExpression(Token.TokenComma, Token.TokenRightBrace);
            } else {
                tokenInfo = this.lexer.peekTokenInfo();
                if (tokenInfo.token !== Token.TokenComma && tokenInfo.token !== Token.TokenRightBrace) {
                    platform.programFail(`expected ',' or '}' after ${member.id}`);
                }
            }

            astEnumDef.members.push(member);
        } while (this.lexer.forwardIfMatch(Token.TokenComma));
        this.getToken();

        return astEnumDef;
    }

    parseStruct(structName) {
        const astStructDef = {
            astType: Ast.AstStruct,
            name: structName,
            members: []
        };

        // 暂时不允许嵌套定义struct
        let astCompositeOrDecl;
        do {
            astCompositeOrDecl = this.parseDeclaration();

            // 生成struct的member
            if (astCompositeOrDecl.astType === Ast.AstComposite) {
                for (let astDecl of astComposite.astList) {
                    astStructDef.members.push(astDecl);
                }
            } else {
                astStructDef.members.push(astCompositeOrDecl);
            }
        } while (this.peekToken() !== Token.TokenRightBrace);
        this.getToken();

        return astStructDef;
    } // end of parseStruct()

    processEnumDef() {
        let makeupName = false;
        const oldState = this.stateSave();
        const enumTokenInfo = this.getTokenInfo();

        if (this.lexer.peekIfMatch(Token.TokenLeftBrace)) {
            // makeup a name
            const enumName = this.makeEnumName();
            makeupName = true;
            const nameTokenInfo = this.lexer.makeTokenInfo(
                                                Token.TokenIdentifier,
                                                enumName, 0, 0);
            this.lexer.insertTokens(nameTokenInfo);
        }

        if (this.lexer.peekIfMatch(Token.TokenIdentifier, Token.TokenLeftBrace)) {
            const identTokenInfo = this.getTokenInfo();
            this.getToken();

            const astEnumDef = this.parseEnum(identTokenInfo.value);
            if (this.lexer.forwardIfMatch(Token.TokenSemicolon)) {
                if (makeupName) {
                    platform.programFail(`expected type name before '{'`);
                }
            } else {
                // 在完整的enum定义之后如果没有立即出现';'
                // 说明此enum可能被马上用来声明变量，例如：
                //  enum {
                //      Sunday,
                //      Monday,
                //      ...
                //  } WeekDay;
                // 
                // 这种情况下一条语句会产生两个AST
                // 为了解决这个问题，在enum完整定义后立即插入两个token：
                // <TokenEnumType, TokenIdentifier>并返回
                // 这样将一条语句分成了两条语句，下次再解析的时候会进行声明语句的处理
                this.lexer.insertTokens(enumTokenInfo, identTokenInfo);
            }
            
            return astEnumDef;
        }

        this.stateRestore(oldState);
        return null;
    }

    processStructDef(isTypedef) {
        let makeupName = false;
        let structName = null;

        const oldState = this.stateSave();
        const structTokenInfo = this.getTokenInfo();
        const isUnionType = (structTokenInfo.token === Token.TokenUnionType);

        if (this.lexer.peekIfMatch(Token.TokenLeftBrace)) {
            // makeup a name
            structName = this.makeStructName();
            makeupName = true;
            const nameTokenInfo = this.lexer.makeTokenInfo(
                                                Token.TokenIdentifier,
                                                structName, 0, 0);
            this.lexer.insertTokens(nameTokenInfo);
        }

        if (this.lexer.peekIfMatch(Token.TokenIdentifier, Token.TokenLeftBrace)) {
            const identTokenInfo = this.getTokenInfo();
            this.getToken();
            const astStructDef = this.parseStruct(identTokenInfo.value);
            if (isUnionType) {
                astStructDef.astType = Ast.AstUnion; // a little hack
            }
            if (this.lexer.forwardIfMatch(Token.TokenSemicolon)) {
                if (isTypedef) {
                    platform.programFail(`expected type name before ';'`);
                } else if (makeupName) {
                    platform.programFail(`expected type name before '{'`);
                }
            } else {
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
                if (isTypedef) {
                    const typedefTokenInfo = this.lexer.makeTokenInfo(Token.TokenTypedef,
                                                                        null, 0, 0);
                    this.lexer.insertTokens(nameTokenInfo);
                }

                this.lexer.insertTokens(structTokenInfo, identTokenInfo);
            }
            
            return astStructDef;
        }

        this.stateRestore(oldState);
        return null;
    }

    parseTypedef() {
        const astList = [];
        let token, ident;
        const astOriginalType = this.parseType();
        if (astOriginalType === null) {
            platform.programFail(`unrecognized type`);
        }

        let astTypedef;
        let totalPtrs;
        do {
            // 解析指针
            totalPtrs = astOriginalType.numPtrs;
            while (this.lexer.forwardIfMatch(Token.TokenAsterisk)) {
                totalPtrs ++;
            }

            ({token, value: ident} = this.getTokenInfo());
            if (token !== Token.TokenIdentifier) {
                platform.programFail(`need a identifier here, instead got token type ${Token.getTokenName(token)}`);
            }

            // 处理数组下标
            let arrayIndexes = [];
            while (this.lexer.forwardIfMatch(Token.TokenLeftSquareBracket)) {
                let astIndex = this.parseExpression(Token.TokenRightSquareBracket);
                this.getToken();
                arrayIndexes.push(astIndex);
            }

            // 由声明语句生成的AST
            astTypedef = {
                astType: Ast.AstTypedef,
                dataType: {
                    baseType: astOriginalType.baseType,
                    numPtrs: totalPtrs,
                    customType: astOriginalType.customType,
                    arrayIndexes: arrayIndexes.concat(astOriginalType.arrayIndexes.slice())
                },
                ident: ident
            };

            // 添加到当前语句块
            astList.push(astTypedef);

            // 由于无法区分自定义类型和普通标识符，
            // 这里将自定义类型放入表中以便后续查找区分
            this.typedefs.set(ident, astTypedef);
        } while (this.lexer.forwardIfMatch(Token.TokenComma));

        if (this.getToken() !== Token.TokenSemicolon) {
            platform.programFail(`missing ';' after typedefs`);
        }

        if (astList.length === 1) {
            return astTypedef;
        } else {
            return Ast.createList(...astList);
        }
    }

    /* 解析声明语句，返回AST */
    parseDeclaration(...stopAt) {
        const astList = [];
        let token, ident;
        let rhs;
        const astOriginalType = this.parseType();
        if (astOriginalType === null) {
            platform.programFail(`unrecognized type`);
        }

        // 检查是否为函数声明/定义
        if (this.lexer.peekIfMatch(Token.TokenIdentifier, Token.TokenOpenParenth)) {
            return this.parseFuncDef(returnType);
        }

        let astDecl;
        let totalPtrs;
        do {
            // 解析指针
            totalPtrs = astOriginalType.numPtrs;
            while (this.lexer.forwardIfMatch(Token.TokenAsterisk)) {
                totalPtrs ++;
            }

            ({token, value: ident} = this.getTokenInfo());
            if (token !== Token.TokenIdentifier) {
                if (astDecl.dataType.baseType === BaseType.TypeStruct && token === Token.TokenSemicolon) {
                    return null;
                }
                platform.programFail(`need a identifier here, instead got token '${Token.getTokenName(token)}'`);
            }

            // 处理数组下标
            const arrayIndexes = [];
            while (this.lexer.forwardIfMatch(Token.TokenLeftSquareBracket)) {
                if (this.lexer.forwardIfMatch(Token.TokenRightSquareBracket)) {
                    platform.programFail(`array size missing in '${astDecl.ident}'`);
                }
                let astIndex = this.parseExpression(Token.TokenRightSquareBracket);
                this.getToken();
                arrayIndexes.push(astIndex);
            }

            // 由声明语句生成的AST
            astDecl = {
                astType: Ast.AstDeclaration,
                dataType: {
                    baseType: astOriginalType.baseType,
                    numPtrs: totalPtrs,
                    customType: astOriginalType.customType,
                    arrayIndexes: arrayIndexes.concat(astOriginalType.arrayIndexes.slice())
                },
                ident: ident,
                rhs: null
            };

            // 处理赋值
            if (this.lexer.forwardIfMatch(Token.TokenAssign)) {
                if (this.lexer.forwardIfMatch(Token.TokenLeftBrace)) {
                    let initValues = this.parseArrayInitializer();

                    // 检查变量是否为数组或struct
                    if ((astDecl.dataType.baseType !== BaseType.TypeStruct || astDecl.dataType.numPtrs !== 0) && astDecl.dataType.arrayIndexes.length === 0) {
                        platform.programFail(`can only apply initializer to array or struct`);
                    }

                    rhs = {
                        astType: Ast.AstArrayInitializer,
                        initValues: initValues
                    };
                } else {
                    rhs = this.parseExpression(Token.TokenComma, Token.TokenSemicolon);
                }

                astDecl.rhs = rhs;
            }

            // 添加到当前语句块
            astList.push(astDecl);

            token = this.peekToken();
            if (stopAt.includes(token)) {
                break;
            }
        } while (this.lexer.forwardIfMatch(Token.TokenComma));

        if (this.getToken() !== Token.TokenSemicolon) {
            platform.programFail(`missing ';' after declaration`);
        }

        if (astList.length === 1) {
            return astDecl;
        } else {
            return Ast.createList(...astList);
        }
    } // end of parseDeclaration(...stopAt)

    // 解析数组初始化列表
    parseArrayInitializer() {
        let elem;
        let token;
        let initValues = [];

        do {
            token = this.peekToken();
            if (token === Token.TokenRightBrace) {
                platform.programFail(`empty initializer list`);
            }

            if (this.lexer.forwardIfMatch(Token.TokenLeftBrace)) {
                // 嵌套的初始化列表
                elem = this.parseArrayInitializer();

                token = this.peekToken();
                if (token !== Token.TokenRightBrace && token !== Token.TokenComma) {
                    platform.programFail(`unexpected token ${token} after '}'`);
                }
            } else {
                elem = this.parseExpression(Token.TokenComma, Token.TokenRightBrace);
            }

            initValues.push(elem);
        } while (this.lexer.forwardIfMatch(Token.TokenComma));

        this.getToken();

        return initValues;
    }

    retrieveIdentAst() {
        let token = Token.TokenNone;
        let ident = null;
        let done = false;
        let isField = false;
        let refByPtr = false;

        const astIdent = {
            astType: Ast.AstIdentifier,
            ident: null,
            accessIndexes: [],
            fieldsChain: []
        };

        do {
            let accessIndexes = [];

            ({token, value: ident} = this.getTokenInfo());
            assert(token === Token.TokenIdentifier, `internal: retrieveIdentAst(): wrong token type ${Token.getTokenName(token)}`);

            // 处理数组下标
            while (this.lexer.forwardIfMatch(Token.TokenLeftSquareBracket)) {
                let astIndex = this.parseExpression(Token.TokenRightSquareBracket);
                accessIndexes.push(astIndex);
                this.getToken();
            }

            if (isField) {
                const astField = {
                    astType: null,
                    ident: ident,
                    accessIndexes: accessIndexes
                };
                if (refByPtr) {
                    astField.astType = Ast.AstRefByPtr;
                } else {
                    astField.astType = Ast.AstRefByDot;
                }
                astIdent.fieldsChain.push(astField);
            } else {
                astIdent.ident = ident;
                astIdent.accessIndexes = accessIndexes;
            }

            // 处理struct/union成员
            token = this.peekToken();
            if (token === Token.TokenDot || token === Token.TokenArrow) {
                isField = true;
                refByPtr = token === Token.TokenDot ? false : true;
                this.getToken();
            } else {
                break;
            }
        } while (true);

        return astIdent;
    } // end of retrieveIdentAst()

    // 解析赋值语句，包括=, +=, -=, <<=一类的赋值语句
    parseAssignment(lhs, assignToken) {
        const astAssign = {
            astType: Ast.AstAssign,
            lhs: lhs,
            rhs: this.parseExpression(Token.TokenComma, Token.TokenSemicolon),
            assignToken: assignToken
        };

        return astAssign;
    }

    // 三目运算符单独处理
    parseTernaryOperator(elementList) {
        const newList = [];
        let elem;

        while (elementList.length !== 0) {
            elem = elementList.shift();
            if (elem.astType === Ast.AstOperator &&
                    elem.token === Token.TokenQuestionMark) {
                elem = this.parseTernaryExpression(newList, elementList);
                return [elem];
            }

            newList.push(elem);
        }

        // 没有三目运算符
        return newList;
    }

    // 递归函数解析三目运算符并生成AST
    parseTernaryExpression(conditional, elementList) {
        const expr1 = [];
        const expr2 = [];

        let elem;
        let curExpr = expr1;
        let hasColon = false;
        while (elementList.length !== 0) {
            elem = elementList.shift();
            if (elem.astType === Ast.AstOperator) {
                if (elem.token === Token.TokenQuestionMark) {
                    elem = this.parseTernaryExpression(curExpr.slice(), elementList);
                    curExpr.splice(0); // 清空当前表达式列表
                } else if (elem.token === Token.TokenColon) {
                    if (hasColon) {
                        elementList.unshift(elem);
                        break;
                    }
                    hasColon = true;
                    curExpr = expr2;
                    continue;
                }
            }

            curExpr.push(elem);
        }

        if (!hasColon) {
            platform.programFail(`missing ':' in ternary operator`);
        }

        if (conditional.length === 0) {
            platform.programFail(`expect expression before '?'`);
        }
        
        if (expr1.length === 0) {
            platform.programFail(`expect expression before ':'`);
        }

        if (expr2.length === 0) {
            platform.programFail(`expect expression after ':'`);
        }

        return {
            astType: Ast.AstTernary,
            conditional: {
                astType: Ast.AstExpression,
                elementList: conditional,
                next: null
            },
            expr1: {
                astType: Ast.AstExpression,
                elementList: expr1,
                next: null
            },
            expr2: {
                astType: Ast.AstExpression,
                elementList: expr2,
                next: null
            }
        };
    } // end of parseTernaryExpression

    // 处理单目运算符，C语言的单目运算符结合方向都是从右到左
    parseUnaryOperator(elementList) {
        // 先单独处理单目运算符++, --, 因为这两种运算符可以有前缀和后缀两种形式
		// 经过下面的处理后，后缀形式的++和--将被消除，便于后续处理其他单目运算符
        elementList.forEach((v, idx, arr) => {
            if (v === undefined) {
                return;
            }

            if (v.astType === Ast.AstOperator &&
                (v.token === Token.TokenIncrement || v.token === Token.TokenDecrement)) {
                // ++ ++a; 不合法
                if ((idx+1) >= arr.length || arr[idx+1].astType !== Ast.AstIdentifier) {
                    platform.programFail(`lvalue is required here`);
                }
                // a++ ++; ++a++; 不合法
                if ((idx-1) > 0 && arr[idx-1] === undefined) {
                    platform.programFail(`lvalue is required here`);
                }

                arr[idx] = {
                    astType: Ast.AstPrefixOp,
                    token: v.token,
                    astOperand: arr[idx+1]
                };
                arr[idx+1] = undefined;
            } else if (v.astType === Ast.AstIdentifier) {
                if ((idx+1) < arr.length && arr[idx+1].astType === Ast.AstOperator &&
                (arr[idx+1].token == Token.TokenIncrement || arr[idx+1].token == Token.TokenDecrement)) {
                    arr[idx] = {
                        astType: Ast.AstPostfixOp,
                        token: arr[idx+1].token,
                        astOperand: v
                    };
                    arr[idx+1] = undefined;
                }
            }
        });
        elementList = elementList.filter(v => {return v !== undefined});

        // 处理单目运算符*, &, -, ~, !
        elementList.reverse().forEach((v, idx, arr) => {
            if (v.astType !== Ast.AstOperator) {
                return ;
            }
            const prevIdx = idx + 1;
            const nextIdx = idx - 1;
            const prevAst = arr[prevIdx];
            const nextAst = arr[nextIdx];
            let astType = null;

            switch (v.token) {
                case Token.TokenAmpersand:
					// 取地址操作符右边必须是左值
                    if (nextAst === undefined ||
						  nextAst.astType !== Ast.AstIdentifier && nextAst.astType !== Ast.AstTakeValue) {
                        platform.programFail(`lvalue is required here`);
                    }
                    astType = Ast.AstTakeAddress;
                    break;
                case Token.TokenAsterisk:
					//const validAstTypes = [Ast.AstIdentifier, Ast.AstPostfixOp, Ast.AstPrefixOp, Ast.AstTakeAddress, Ast.AstTakeValue];
                    if ((prevAst === undefined || prevAst.astType === Ast.AstOperator) &&
                            nextAst !== undefined && nextAst.astType !== Ast.AstOperator) {
                        astType = Ast.AstTakeValue;
                    }
                    break;
                case Token.TokenMinus:
                    if ((prevAst === undefined || prevAst.astType === Ast.AstOperator) &&
                            nextAst !== undefined && nextAst.astType !== Ast.AstOperator) {
                        astType = Ast.AstUMinus;
                    }
                    break;
                case Token.TokenUnaryNot:
                    if (nextAst === undefined || nextAst.astType === Ast.AstOperator) {
                        platform.programFail(`value is required after unary not`);
                    }
                    astType = Ast.AstUnaryNot;
                    break;
                case Token.TokenUnaryExor:
                    if (nextAst === undefined || nextAst.astType === Ast.AstOperator) {
                        platform.programFail(`value is required after unary not`);
                    }
                    astType = Ast.AstUnaryExor;
                    break;
				case Token.TokenIncrement:
				case Token.TokenDecrement:
                    if (nextAst === undefined || nextAst.astType === Ast.AstTakeValue) {
						platform.programFail(`lvalue is required here`);
                    }
					astType = Ast.AstPrefixOp;
					break;
                default:
                    astType = null;
                    break;
            }

            if (astType !== null) {
                arr[idx] = {
                    astType: astType,
                    token: v.token,
                    astOperand: arr[nextIdx]
                };
                arr[nextIdx] = undefined;
            }
        });

        elementList = elementList.reverse().filter(v => {return v !== undefined});
        return elementList;
    } // end of parseUnaryOperator

    checkIntegerExpression(memberNameHint, ...stopAt) {
        // 表达式默认以分号结尾
        if (stopAt.length === 0) {
            stopAt.push(Token.TokenSemicolon);
        }

        const oldState = this.stateSave();

        const tokenFirst = this.peekToken();
        if (tokenFirst === Token.TokenComma || tokenFirst === Token.TokenRightBrace) {
            platform.programFail(`expected an integer number or expression after '='`);
        }
        if (tokenFirst !== Token.TokenIntegerConstant && tokenFirst !== Token.TokenPlus && tokenFirst !== Token.TokenMinus){
            platform.programFail(`'${Token.getTokenName(tokenFirst)}' is NOT allowed as first token of integer expression`);
        }

        let expectNumber = true;
        let token;
        let tokenInfo;
        do {
            tokenInfo = this.lexer.getTokenInfo();
            switch (tokenInfo.token) {
                case Token.TokenIntegerConstant: // 整数常量
                case Token.TokenAsterisk:   // 乘法
                case Token.TokenSlash:      // 除法
                case Token.TokenModulus:    // 取模
                case Token.TokenPlus:       // 加法
                case Token.TokenMinus:      // 减法
                case Token.TokenShiftLeft:  // 左移
                case Token.TokenShiftRight: // 右移
                case Token.TokenLessThan:   // 小于
                case Token.TokenLessEqual:  // 小于等于
                case Token.TokenGreaterThan:// 大于
                case Token.TokenGreaterEqual:   // 大于等于
                case Token.TokenEqual:          // 等于
                case Token.TokenNotEqual:       // 不等于
                case Token.TokenAmpersand:      // 按位与
                case Token.TokenArithmeticOr:   // 按位或
                case Token.TokenArithmeticExor: // 按位异或
                case Token.TokenLogicalAnd:     // 逻辑与
                case Token.TokenLogicalOr:      // 逻辑或
                case Token.TokenQuestionMark:
                case Token.TokenColon:
                    break;
                default:
                    platform.programFail(`enumerator value for '${memberNameHint}' is not an integer constant`);
                    break;
            }

            token = this.peekToken();
        } while (!stopAt.includes(token));

        this.stateRestore(oldState); 
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

        token = this.peekToken();
        do {
            if (this.lexer.peekIfMatch(Token.TokenIdentifier, Token.TokenOpenParenth)) {
                // 函数调用
                const astFuncCall = this.parseFuncCall();
                elementList.push(astFuncCall);
            } else if (token === Token.TokenIdentifier) { // 变量
                const astIdent = this.retrieveIdentAst();
                if (astIdent === null) {
                    platform.programFail(`expect an identifier here`);
                }
                elementList.push(astIdent);
            } else if (token >= Token.TokenAssign && token <= Token.TokenArithmeticExorAssign) {
                this.getToken();

                // 对形如"*p = xxx"这样的左值进行处理
                elementList = this.parseUnaryOperator(elementList);
                if (elementList.length !== 1) {
                    platform.programFail(`lvalue required as left operand of assignment`);
                }

                // 赋值语句
                const astAssign = {
                    astType: Ast.AstAssign,
                    lhs: elementList[0],
                    rhs: this.parseExpression(Token.TokenComma, Token.TokenSemicolon),
                    assignToken: token
                };
                elementList = [];
                elementList.push(astAssign);
            } else if (token >= Token.TokenQuestionMark && token <= Token.TokenCast) { // 操作符
                const astOperator = {
                    astType: Ast.AstOperator,
                    token: token
                };
                elementList.push(astOperator);
                this.getToken();
            } else if (token >= Token.TokenIntegerConstant && token <= Token.TokenCharacterConstant) {
                ({token, value} = this.getTokenInfo());
                const astConstant = {
                    astType: Ast.AstConstant,
                    token: token,
                    value: value
                };
                elementList.push(astConstant);
            } else if (this.lexer.forwardIfMatch(Token.TokenOpenParenth)) { // 圆括号中的子表达式
                astResult = this.parseExpression(Token.TokenCloseParenth);
                elementList.push(astResult);
                this.getToken();
            } else if (this.lexer.forwardIfMatch(Token.TokenComma)) {
                // 如果逗号不是解析停止符号，将产生表达式AST链表
                astNextExpression = this.parseExpression(...stopAt);
                break; // 跳出
            } else if (token === Token.TokenSemicolon) { 
                // 表达式解析不能跨越分号
                // 如果分号在指定的停止符号之前出现，说明这是错误的语法
                if (!(stopAt.includes(Token.TokenSemicolon))) {
                    platform.programFail(`expected '${Token.getTokenName(stopAt[0])}' before ';' token `);
                }
            } else if (token === Token.TokenEOF) {
                platform.programFail(`incomplete expression`);
            } else {
                platform.programFail(`expression: unrecognized token type ${Token.getTokenName(token)}`);
            }

            token = this.peekToken();
        } while (!stopAt.includes(token));
    
        // 处理单目运算符
        elementList = this.parseUnaryOperator(elementList);

        // 处理三目运算符
        elementList = this.parseTernaryOperator(elementList);

        // 注意：此时elementList中只剩下二元运算符(或者单个元素)，便于后续计算整个表达式的值

        // 将表达式元素打包为一个AST
        const astExpression = {
            astType: Ast.AstExpression,
            elementList: elementList,
            next: astNextExpression
        };

        return astExpression;
    } // end of parseExpression(stopAt)

    createAstBlock() {
        return {
            astType: Ast.AstBlock,
            statements: [],
            push: function(astStatement) {
                return this.statements.push(astStatement);
            }
        };
    }

    parseBlock(...stopAt) {
        // 处理空语句块
        if (stopAt.includes(this.peekToken())) {
            return null;
        }

        let token = Token.TokenNone;
        const astBlock = this.createAstBlock();

        do {
            let astStatement = this.parseStatement();
            if (astStatement !== null) {
                astBlock.push(astStatement);
            }

            token = this.peekToken();
        } while (!stopAt.includes(token));

        return astBlock;
    }
    
    // 解析if...else/for/while/do...while/function definition等的语句体
    parseBody() {
        let astResult = null;

        /*
        if (this.lexer.forwardIfMatch(Token.TokenLeftBrace)) {
            astResult = this.parseBlock(Token.TokenRightBrace);
        } else {
            // 如果语句体没有大括号，则其必须为表达式
            astResult = this.parseExpression();
        }
        this.getToken();
        */

        astResult = this.parseStatement();
        return astResult;
    } // end of parseBody()

    parseWhile() {
        let token = Token.TokenNone;
        let conditional = null;
        let astWhile = {
            astType: Ast.AstWhile,
            conditional: null,
            body: null
        };

        if (!this.lexer.forwardIfMatch(Token.TokenOpenParenth)) {
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

        token = this.getToken();
        if (token !== Token.TokenLeftBrace) {
            platform.programFail(`missing '{' after do keyword`);
        }

        astDoWhile.body = this.parseBody();
        if (!this.lexer.forwardIfMatch(Token.TokenWhile)) {
            platform.programFail(`missing while keyword after '}'`);
        }

        if (!this.lexer.forwardIfMatch(Token.TokenOpenParenth)) {
            platform.programFail(`'(' expected`);
        }

        token = this.peekToken();
        if (token !== Token.TokenCloseParenth) {
            let conditional = this.parseExpression(Token.TokenCloseParenth);
            astDoWhile.conditional = conditional;
            this.getToken();
            if (this.getToken() !== Token.TokenSemicolon) {
                platform.programFail(`missing ';' after ')'`);
            }
        } else {
            platform.programFail(`expected expression before ')' token`);
        }

        return astDoWhile;
    } // end of parseDoWhile

    parseFor() {
        let initial = null;
        let conditional = null;
        let finalExpression = null;

        const astFor = {
            astType: Ast.AstFor,
            initial: null,
            conditional: null,
            finalExpression: null,
            body: null
        };

        if (!this.lexer.forwardIfMatch(Token.TokenOpenParenth)) {
            platform.programFail(`'(' expected`);
        }

        initial = this.parseStatement();
        conditional = this.parseExpression();
        if (!this.lexer.forwardIfMatch(Token.TokenSemicolon)) {
            platform.programFail(`';' expected`);
        }

        finalExpression = this.parseExpression(Token.TokenCloseParenth);
        if (!this.lexer.forwardIfMatch(Token.TokenCloseParenth)) {
            platform.programFail(`')' expected`);
        }

        astFor.initial = initial;
        astFor.conditional = conditional;
        astFor.finalExpression = finalExpression;
        astFor.body = this.parseBody();
        
        return astFor;
    } // end of parseFor()

    parseSwitch() {
        let token = Token.TokenNone;

        const astSwitch = {
            astType: Ast.AstSwitch,
            value: null,
            cases: [],
            default: null,
            pushCase: function(expression, block) {
                this.cases.push({
                    expression: expression,
                    block: block
                });
            }
        };

        if (!this.lexer.forwardIfMatch(Token.TokenOpenParenth)) {
            platform.programFail(`'(' expected`);
        }

        token = this.peekToken();
        if (token !== Token.TokenCloseParenth) {
            astSwitch.value = this.parseExpression(Token.TokenCloseParenth);
            this.getToken();
        } else {
            platform.programFail(`expected expression before ')' token`);
        }

        if (!this.lexer.forwardIfMatch(Token.TokenLeftBrace)) {
            platform.programFail(`'{' expected`);
        }

        while (this.lexer.forwardIfMatch(Token.TokenCase)) {
            let expression = this.parseExpression(Token.TokenColon);
            this.getToken();
            let block = this.parseBlock(Token.TokenCase, Token.TokenDefault, Token.TokenRightBrace);
            astSwitch.pushCase(expression, block);
        }

        if (this.lexer.forwardIfMatch(Token.TokenDefault)) {
            if (this.getToken() !== Token.TokenColon) {
                platform.programFail(`':' expected`);
            }

            let block = this.parseBlock(Token.TokenCase, Token.TokenDefault, Token.TokenRightBrace);
            astSwitch.default = block;

            // 这里不允许case语句出现在default之后
            token = this.peekToken();
            if (token === Token.TokenCase) {
                platform.programFail(`you should always put 'case label' before 'default label'`);
            }

            if (token == Token.TokenDefault) {
                platform.programFail(`multiple default labels in one switch`);
            }
        }

        this.getToken();

        return astSwitch;
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

        if (!this.lexer.forwardIfMatch(Token.TokenOpenParenth)) {
            platform.programFail(`'(' expected`);
        }

        token = this.peekToken();
        if (token !== Token.TokenCloseParenth) {
            conditional = this.parseExpression(Token.TokenCloseParenth);
            astIf.conditional = conditional;
            this.getToken();
        } else {
            platform.programFail(`expect expression before ')' token`);
        }

        astIf.ifBranch = this.parseBody();

        // 处理else分支
        if (this.lexer.forwardIfMatch(Token.TokenElse)) {
            if (this.lexer.forwardIfMatch(Token.TokenIf)) {
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
    _parseParams() {
        const paramList = [];
        let hasParamName = true;

        // 先检查一下是否有参数
        if (this.lexer.forwardIfMatch(Token.TokenCloseParenth)) {
            return [];
        }

        do {
            const astParamType = this.parseType();
            if (astParamType === null) {
                platform.programFail(`expected a parameter type`);
            }

            // 解析指针
            while (this.lexer.forwardIfMatch(Token.TokenAsterisk)) {
                astParamType.numPtrs ++;
            }

            // 参数的AST
            const astParam = {
                astType: Ast.AstParam,
                paramType: astParamType,
                ident: null
            };

            // 函数声明中参数可以没有名字
            if (this.peekToken() === Token.TokenComma) {
                hasParamName = false;
                paramList.push(astParam);
                continue ;
            }

            let {token, value: paramName} = this.getTokenInfo();
            if (token !== Token.TokenIdentifier) {
                platform.programFail(`expect parameter name, but got token ${Token.getTokenName(token)}`);
            }

            astParam.ident = paramName;

            // 处理数组下标
            let firstParam = true;
            let nullIndex = false;
            const originalArrayIndexes = astParamType.arrayIndexes;
            astParamType.arrayIndexes = [];
            while (this.lexer.forwardIfMatch(Token.TokenLeftSquareBracket)) {
                if (this.lexer.forwardIfMatch(Token.TokenRightSquareBracket)) {
                    // 允许"func(int a[])"这种空索引作为参数
                    // 注意：只允许一维数组使用这种简化语法，多维数组必须完整指定索引值，例如"func(int a[][])"是不允许的
                    if (!firstParam || originalArrayIndexes.length !== 0) {
                        platform.programFail(`declaration of '${paramName}' as multidimensional array must have bounds for all dimensions`);
                    }

                    astParamType.arrayIndexes.push(null);
                    nullIndex = true;
                } else {
                    if (nullIndex) {
                        platform.programFail(`declaration of '${paramName}' as multidimensional array must have bounds for all dimensions`);
                    }
                    let astIndex = this.parseExpression(Token.TokenRightSquareBracket);
                    this.getToken();
                    astParamType.arrayIndexes.push(astIndex);
                }
                firstParam = false;
            }
            astParamType.arrayIndexes = astParamType.arrayIndexes.concat(originalArrayIndexes);

            // 添加到参数AST列表
            paramList.push(astParam);
        } while (this.lexer.forwardIfMatch(Token.TokenComma));

        if (!this.lexer.forwardIfMatch(Token.TokenCloseParenth)) {
            platform.programFail(`expected ',' or ')'`);
        }

        return paramList;
    } // end of _parseParams() 

    parseFuncDef(returnType) {
        const astFuncDef = {
            astType: Ast.AstFuncDef,
            name: null,
            params: [],
            body: null,
            returnType: returnType
        };

        let {token, value: funcName} = this.getTokenInfo();

        assert(token, Token.TokenIdentifier, `parseFuncDef(): expected identifier but got '${Token.getTokenName(token)}'`);

        token = this.getToken();
        assert(token, Token.TokenOpenParenth, `parseFuncDef(): expected '(' but got '${Token.getTokenName(token)}'`);

        astFuncDef.name = funcName;
        astFuncDef.params = this._parseParams();

        token = this.peekToken();
        if (token === Token.TokenLeftBrace) {
            // 函数定义中，函数的参数必须有名字
            for (let param of astFuncDef.params) {
                if (param.ident === null) {
                    platform.programFail(`parameter name omitted`);
                }
            }

            astFuncDef.body = this.parseBody();
        } else if (token === Token.TokenSemicolon) {
            // 只是函数声明，没有函数体
            astFuncDef.body = undefined;
            this.getToken();
        } else {
            platform.programFail(`expected ';' or '{' after ')'`);
        }

        return astFuncDef;
    } // end of parseFuncDef()

    parseFuncCall() {
        let {token, value: funcName} = this.getTokenInfo();
        assert(token === Token.TokenIdentifier,
                    `parseFuncCall(): expected identifier but got '${Token.getTokenName(token)}'`);

        token = this.getToken();
        assert(token === Token.TokenOpenParenth,
                    `parseFuncCall(): expected '(' but got '${Token.getTokenName(token)}'`);

        const args = this.parseExpression(Token.TokenCloseParenth);
        this.getToken();

        const astFuncCall = {
            astType: Ast.AstFuncCall,
            name: funcName,
            args: args
        };

        return astFuncCall;
    }

    /* 解析一条语句，返回此语句对应的AST
     * 语句有一下几种类型：
     * 1、声明语句，包括变量声明，函数定义
     * 2、表达式语句，包括赋值，函数调用，算数/逻辑表达式等
     * 3、struct/union/enum/typedef用户自定义类型语句
     * 4、if...else/for/while/do...while/switch等控制语句
     * 5、语句块
     */
    parseStatement() {
        let astResult = null;
        let isUnionType = false;
        const {token: firstToken, value: firstValue} = this.lexer.peekTokenInfo();

        while (astResult === null) {
            switch (firstToken) {
                case Token.TokenEOF:
                    return null;
                    break;

                case Token.TokenSemicolon:
                    // 如果此语句只有分号，直接返回null
                    this.getToken();
                    break;

                case Token.TokenIdentifier:
                    if (this.typedefs.get(firstValue) !== undefined) {
                        // identifier是由typedef定义的自定义类型
                        astResult = this.parseDeclaration();
                        return astResult;
                    } // 否则按expression处理
                case Token.TokenAsterisk:
                case Token.TokenAmpersand:
                case Token.TokenIncrement:
                case Token.TokenDecrement:
                case Token.TokenOpenParenth:
                    astResult = this.parseExpression();
                    if (this.getToken() !== Token.TokenSemicolon) {
                        platform.programFail(`missing ';' after expression`);
                    }
                    break;
                    
                case Token.TokenLeftBrace:
                    this.getToken();
                    astResult = this.parseBlock(Token.TokenRightBrace);
                    this.getToken();
                    break;

                // 解析控制语句 
                case Token.TokenIf:
                    this.getToken();
                    astResult = this.parseIf();
                    break;
                case Token.TokenWhile:
                    this.getToken();
                    astResult = this.parseWhile();
                    break;
                case Token.TokenDo:
                    this.getToken();
                    astResult = this.parseDoWhile();
                    break;
                case Token.TokenFor:
                    this.getToken();
                    astResult = this.parseFor();
                    break;
                case Token.TokenSwitch:
                    this.getToken();
                    astResult = this.parseSwitch();
                    break; 

                case Token.TokenEnumType:
                    astResult = this.processEnumDef();
                    if (astResult === null) {
                        astResult = this.parseDeclaration();
                    }
                    break;

                case Token.TokenUnionType:
                case Token.TokenStructType:
                    astResult = this.processStructDef(false);
                    if (astResult === null) {
                        astResult = this.parseDeclaration();
                    }
                    break;

                // 下列为以类型开始的语句，按照声明语句来解析(包括函数定义)
                case Token.TokenIntType:
                case Token.TokenShortType:
                case Token.TokenCharType:
                case Token.TokenLongType:
                case Token.TokenFloatType:
                case Token.TokenDoubleType:
                case Token.TokenVoidType:
                case Token.TokenUnionType:
                case Token.TokenEnumType:
                case Token.TokenSignedType:
                case Token.TokenUnsignedType:
                case Token.TokenStaticType:
                case Token.TokenAutoType:
                case Token.TokenRegisterType:
                case Token.TokenExternType:
                    astResult = this.parseDeclaration();
                    break;
                   
                case Token.TokenTypedef:
                    this.lexer.getToken();
                    astResult = this.processStructDef(true);
                    if (astResult !== null) {
                        return astResult;
                    }
                    astResult = this.parseTypedef();
                    break; 

                case Token.TokenGoto:
                    break; 

                case Token.TokenBreak:
                    this.getToken();
                    astResult = {
                        astType: Ast.AstBreak,
                        token: Token.TokenBreak
                    };
                    if (this.getToken() !== Token.TokenSemicolon) {
                        platform.programFail(`missing ';' after expression`);
                    }
                    break;

                case Token.TokenContinue:
                    this.getToken();
                    astResult = {
                        astType: Ast.AstContinue,
                        token: Token.TokenContinue
                    };
                    if (this.getToken() !== Token.TokenSemicolon) {
                        platform.programFail(`missing ';' after expression`);
                    }
                    break;
                case Token.TokenReturn:
                    this.getToken();
                    astResult = {
                        astType: Ast.AstReturn,
                        value: this.parseExpression()
                    };
                    if (this.getToken() !== Token.TokenSemicolon) {
                        platform.programFail(`missing ';' after expression`);
                    }
                    break;

                default:
                    platform.programFail(`Unrecognized leading token in a statement: ${firstToken}`);
            }
        }

        return astResult;
    } // end of parseStatement()
}

module.exports = Parser;
