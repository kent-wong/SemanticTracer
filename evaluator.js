const assert = require('assert');
const Token = require('./interpreter');
const BaseType = require('./basetype');
const ValueType = require('./valuetype');
const Scopes = require('./scopes');
const platform = require('./platform');
const Ast = require('./ast');
const Variable = require('./variable');

class Evaluator {
    constructor() {
        this.scopes = new Scopes();
    }

    evalDeclaration(astDecl) {
        assert(astDecl.astType === Ast.AstDeclaration,
                    `internal error: evalDeclaration(): param is NOT AstDeclaration`);
        assert(astDecl.ident !== null,
                    `internal error: evalDeclaration(): param has null ident`);

        const dataType = this.createDataType(astDecl.dataType.astBaseType,
                                                astDecl.dataType.numPtrs,
                                                astDecl.dataType.ident);
        for (let idx of astDecl.arrayIndexes) {
            dataType.arrayIndexes.push(this.evalExpressionInt(idx));
        }

        let evalRHS;
        if (astDecl.rhs !== null) {
            evalRHS = this.evalExpression(astDecl.rhs);
            if (!this.checkCompatibleTypeValue(dataType, evalRHS)) {
                platform.programFail(`incompatible value`);
            }
        }

        return new Variable(dataType, astDecl.ident, evalRHS);
    }

    // 处理自增/自减运算
    evalSelfOp(astIdent, isPostfix, isIncr) {
        // 默认为后自增运算符
        if (isPostfix === undefined) {
            isPostfix = true;
        }

        if (isIncr === undefined) {
            isIncr = true;
        }

        // 通过AST获取变量，此变量必须存在于当前有效的scopes中
        const variable = this.evalGetVariable(astIdent.ident);
        if (variable === null) {
            platform.programFail(`${astIdent.ident} undeclared`);
        }

        variable.checkAccessIndexes(astIdent.arrayIndexes);

        if (variable.arrayIndexes.length !== 0 && astIdent.arrayIndexes.length === 0) {
            // 数组本身不能进行自增操作
            if (astIdent.token === Token.TokenIncrement) {
                platform.programFail(`array can not be used as increment operand`);
            } else {
                platform.programFail(`array can not be used as decrement operand`);
            }
        }

        // 检查++/--操作能否在此variable或其元素上进行
        const ok = this.checkSelfOpType(variable.dataType);
        if (!ok) {
            if (astIdent.token === Token.TokenIncrement) {
                platform.programFail(`wrong type argument to increment`);
            } else {
                platform.programFail(`wrong type argument to decrement`);
            }
        }

        // 变量必须是左值
        if (variable.ident === null) {
            platform.programFail(`lvalue required`);
        }

        const delta = (isIncr ? 1 : -1);
        if (isPostfix) {
            const tempVariable = variable.copyElement(astIdent.accessIndexes);
            this.setValueIncr(delta, astIdent.accessIndexes);
        } else {
            this.setValueIncr(delta, astIdent.accessIndexes);
            const tempVariable = variable.copyElement(astIdent.accessIndexes);
        }

        return tempVariable;
    }

    evalPostfixIncr(astIdent) {
        return this.evalSelfOp(astIdent, true, true);
    }

    evalPostfixDecr(astIdent) {
        return this.evalSelfOp(astIdent, true, false);
    }

    evalPrefixIncr(astIdent) {
        return this.evalSelfOp(astIdent, false, true);
    }

    evalPrefixDecr(astIdent) {
        return this.evalSelfOp(astIdent, false, false);
    }

    evalGetVariable(name) {
        let v = this.scopes.findIdent(name);
        if (v === undefined) {
            v = null;
        }
        return v;
    }

    // 检查变量的数据类型是否允许自增/自减操作
    checkSelfOpType(dataType) {
        if (dataType.customType !== null) {
            // todo: 如果是typedef int sometype; 那么应该返回true
            return false;
        }

        switch (dataType.basetype) {
            case BaseType.TypeInt:
            case BaseType.TypeShort:
            case BaseType.TypeChar:
            case BaseType.TypeLong:
            case BaseType.TypeUnsignedInt:
            case BaseType.TypeUnsignedShort:
            case BaseType.TypeUnsignedChar:
            case BaseType.TypeUnsignedLong:
            case BaseType.TypeFP:
                return true;
        }

        return false; // todo
    }

    // 取地址运算符
    evalTakeAddress(astTakeAddress) {
        const astIdent = astTakeAddress.astIdent;

        // 通过AST获取变量，此变量必须存在于当前有效的scopes中
        const variable = this.evalGetVariable(astIdent.ident);
        if (variable === null) {
            platform.programFail(`${astIdent.ident} undeclared`);
        }
        // 变量必须是左值
        if (variable.name === null) {
            platform.programFail(`lvalue required`);
        }

        variable.checkAccessIndexes(astIdent.accessIndexes);
        return variable.createElementRefVariable(astIdent.accessIndexes);
    }

    evalTakeValue(astTakeValue) {
        const astIdent = astTakeValue.astIdent;
        const variable = this.evalGetVariable(astIdent.ident);
        if (variable === null) {
            platform.programFail(`${astIdent.ident} undeclared`);
        }

        // 变量或变量元素的类型必须是指针
        if (variable.dataType.numPtrs === 0) {
            platform.programFail(`not a pointer`);
        }

        const ptr = variable.getValue(astIdent.accessIndexes);
        if (ptr === null) {
            return null;
        }

        return ptr.refTo.createElementVariable(ptr.indexes);
    }

    evalTakeUMinus(astMinus) {
        const astIdent = astMinus.astIdent;
        const variable = this.evalGetVariable(astIdent.ident);
        if (variable === null) {
            platform.programFail(`${astIdent.ident} undeclared`);
        }

        variable.setValueMinus(null, astIdent.accessIndexes);
        return variable.createElementVariable(astIdent.accessIndexes);
    }

    evalTakeNot(astNot) {
        const astIdent = astNot.astIdent;
        const variable = this.evalGetVariable(astIdent.ident);
        if (variable === null) {
            platform.programFail(`${astIdent.ident} undeclared`);
        }

        variable.setValueNot(null, astIdent.accessIndexes);
        return variable.createElementVariable(astIdent.accessIndexes);
    }

    evalTakeExor(astExor) {
        const astIdent = astExor.astIdent;
        const variable = this.evalGetVariable(astIdent.ident);
        if (variable === null) {
            platform.programFail(`${astIdent.ident} undeclared`);
        }

        variable.setValueExor(null, astIdent.accessIndexes);
        return variable.createElementVariable(astIdent.accessIndexes);
    }

    evalVariableFromAstIdent(astIdent) {
        const variable = this.evalGetVariable(astIdent.ident);
        if (variable === null) {
            platform.programFail(`${astIdent.ident} undeclared`);
        }
        return variable.createElementVariable(astIdent.accessIndexes);
    }

    // 元素列表中的运算符都是双目运算符
    assertValidExpression(elementList) {
        let expectOperator = false;

        for (let astElement of elementList) {
            if (astElement.astType === Ast.AstOperator) {
                if (!expectOperator) {
                    platform.programFail(`Unexpected operator ${astElement.token}`);
                }
                expectOperator = false;
            } else {
                if (expectOperator) {
                    platform.programFail(`expect operator here`);
                }
                expectOperator = true;
            }
        }

        if (!expectOperator) {
            platform.programFail(`expect expression here`);
        }
    }

    // 将表达式列表中的元素进行计算和转换
    evalExpressionMap(elementList) {
        if (elementList.length === 0) {
            return null;
        }

        const expressionList = [];
        let astType;
        let token;
        let v;
        for (let astElement of elementList) {
            if (astElement.astType === Ast.AstIdentifier) {
                v = this.evalVariableFromAstIdent(astElement);
                token = Token.TokenIdentifier;
                astType = Ast.AstIdentifier;
            } else if (astElement.astType === Ast.AstTakeAddress) {
                v = this.evalTakeAddress(astElement);
                token = Token.TokenIdentifier;
                astType = Ast.AstIdentifier;
            } else if (astElement.astType === Ast.AstTakeValue) {
                v = this.evalTakeValue(astElement);
                token = Token.TokenIdentifier;
                astType = Ast.AstIdentifier;
            } else if (astElement.astType === Ast.AstUMinus) {
                v = this.evalTakeUMinus(astElement);
                token = Token.TokenIdentifier;
                astType = Ast.AstIdentifier;
            } else if (astElement.astType === Ast.AstUnaryNot) {
                v = this.evalTakeNot(astElement);
                token = Token.TokenIdentifier;
                astType = Ast.AstIdentifier;
            } else if (astElement.astType === Ast.AstUnaryExor) {
                v = this.evalTakeExor(astElement);
                token = Token.TokenIdentifier;
                astType = Ast.AstIdentifier;
            } else if (astElement.astType === Ast.AstOperator) {
                const prio = new Map([
                    // 第三等优先级
                    [Token.TokenAsterisk, 3],
                    [Token.TokenSlash, 3],
                    [Token.TokenModulus, 3],

                    // 第四等优先级
                    [Token.TokenPlus, 4],
                    [Token.TokenMinus, 4],

                    // 第五等优先级
                    [Token.TokenShiftLeft, 5],
                    [Token.TokenShiftRight, 5],

                    // 第六等优先级
                    [Token.TokenLessThan, 6],
                    [Token.TokenGreaterThan, 6],
                    [Token.TokenLessEqual, 6],
                    [Token.TokenGreaterEqual, 6],

                    // 第七等优先级
                    [Token.TokenEqual, 7],
                    [Token.TokenNotEqual, 7],

                    // 第八等优先级
                    [Token.TokenAmpersand, 8],

                    // 第九等优先级
                    [Token.TokenArithmeticExor, 9],

                    // 第十等优先级
                    [Token.TokenArithmeticOr, 10],

                    // 第十一等优先级
                    [Token.TokenLogicalAnd, 11],

                    // 第十二等优先级
                    [Token.TokenLogicalOr, 12],

                    // 第十三等优先级
                    [Token.TokenQuestionMark, 13],
                    [Token.TokenColon, 13]
                ]);

                token = astElement.token;
                astType = Ast.AstOperator;
                switch (astElement.token) {
                    case Token.TokenSizeof:
                        // todo
                        break;
                    case Token.TokenCast:
                        // todo
                        break;

                    case Token.TokenAsterisk:
                    case Token.TokenSlash:
                    case Token.TokenModulus:
                    case Token.TokenPlus:
                    case Token.TokenMinus:
                    case Token.TokenShiftLeft:
                    case Token.TokenShiftRight:
                    case Token.TokenLessThan:
                    case Token.TokenGreaterThan:
                    case Token.TokenLessEqual:
                    case Token.TokenGreaterEqual:
                    case Token.TokenEqual:
                    case Token.TokenNotEqual:
                    case Token.TokenAmpersand:
                    case Token.TokenArithmeticExor:
                    case Token.TokenArithmeticOr:
                    case Token.TokenLogicalAnd:
                    case Token.TokenLogicalOr:
                    case Token.TokenQuestionMark:
                    case Token.TokenColon:
                        v = prio.get(astElement.token);
                        assert(v !== undefined, `operator ${astElement.token} has no prio`);
                        break;
                    default:
                        assert(false, `Unrecognized operator type ${astElement.token}`);
                }
            } else if (astElement.astType === Ast.AstConstant) {
                token = astElement.token;
                astType = Ast.AstConstant;
                switch (astElement.token) {
                    case TokenIntegerConstant:
                    case TokenFPConstant:
                    case TokenStringConstant:
                    case TokenCharacterConstant:
                        v = astElement.value;
                        break;
                    default:
                        assert(false, `Unrecognized constant type ${astElement.token}`);
                        break;
                }
            } else if (astElement.astType === Ast.AstExpression) {
                // 子expression
                token = Token.TokenIdentifier;
                v = this.evalExpression(astElement);
                astType = Ast.AstIdentifier;
            } else {
                assert(false, `Unrecognized expression element type ${astElement.astType}`);
            }

            expressionList.push({astType: astType, token: token, value: v});
        }

        return expressionList;
    }

    // 对表达式元素进行求值
    evalExpressionReduce(expressionList) {
        if (expressionList.length === 0) {
            return null;
        }

        const stack = [];
        let elem;
        let bestPrio = 10000; // low enough
        while (expressionList.length !== 0) {
            elem = expressionList.shift();

            // 处理操作符
            if (elem.astType === Ast.AstOperator) {
                let prio = elem.value;
                if (prio < bestPrio) {
                    bestPrio = prio;
                } else {
                    this.evalExpressionReduceStack(stack, prio);
                    bestPrio = prio;
                }
            }

            stack.push(elem);
        }

        this.evalExpressionReduceStack(stack, 10000);

        return stack[0];
    }

    evalExpressionReduceStack(stack, basePrio) {
        assert(stack.length !==0, `internal error: stack.length === 0`);
        assert(stack.length % 2 === 1, `internal error: stack.length is even`);

        if (stack.length === 1) {
            return stack;
        }

        let op;
        let lhs;
        let rhs;
        while (stack.length > 1) {
            op = stack[-2];

            assert(op.astType === Ast.AstOperator);
            if (op.value > basePrio) {
                break;
            }

            rhs = stack.pop();
            stack.pop();
            lhs = stack.pop();
            switch (op.token) {
                case Token.TokenAsterisk:
                    result = Variable.opMultiply(lhs, rhs);
                    break;
                case Token.TokenSlash:
                    result = Variable.opDivide(lhs, rhs);
                    break;
                case Token.TokenModulus:
                    result = Variable.opModulus(lhs, rhs);
                    break;
                case Token.TokenPlus:
                    result = Variable.opAdd(lhs, rhs);
                    break;
                case Token.TokenMinus:
                    result = Variable.opSubtract(lhs, rhs);
                    break;
                case Token.TokenShiftLeft:
                    result = Variable.opShiftLeft(lhs, rhs);
                    break;
                case Token.TokenShiftRight:
                    result = Variable.opShiftRight(lhs, rhs);
                    break;
                case Token.TokenLessThan:
                    result = Variable.opLessThan(lhs, rhs);
                    break;
                case Token.TokenLessEqual:
                    result = Variable.opLessEqual(lhs, rhs);
                    break;
                case Token.TokenGreaterThan:
                    result = Variable.opGreaterThan(lhs, rhs);
                    break;
                case Token.TokenGreaterEqual:
                    result = Variable.opGreaterEqual(lhs, rhs);
                    break;
                case Token.TokenEqual:
                    result = Variable.opEqual(lhs, rhs);
                    break;
                case Token.TokenNotEqual:
                    result = Variable.opNotEqual(lhs, rhs);
                    break;
                case Token.TokenAmpersand:
                    result = Variable.opBitAnd(lhs, rhs);
                    break;
                case Token.TokenArithmeticOr:
                    result = Variable.opBitOr(lhs, rhs);
                    break;
                case Token.TokenArithmeticExor:
                    result = Variable.opBitXor(lhs, rhs);
                    break;
                case Token.TokenLogicalAnd:
                    result = Variable.opLogicalAnd(lhs, rhs);
                    break;
                case Token.TokenLogicalOr:
                    result = Variable.opLogicalOr(lhs, rhs);
                    break;
                case Token.TokenQuestionMark:
                    // todo
                    break;
                case Token.TokenColon:
                    // todo
                    break;
            }

            stack.push(result);
        }

        return stack;
    }

    // 对表达式进行求值
    evalExpression(AstExpression) {
        let astExpr = AstExpression;
        let result;
        let expList;
        do {
            expList = this.evalExpressionMap(astExpr.elementList);
            result = this.evalExpressionReduce(expList);
            astExpr = astExpr.astNextExpression;
        } while (astExpr !== null);

        return result;
    }

}
