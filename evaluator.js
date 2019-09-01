const assert = require('assert');
const Token = require('./interpreter');
const BaseType = require('./basetype');
const ValueType = require('./valuetype');
const Scopes = require('./scopes');
const platform = require('./platform');
const Ast = require('./ast');
const Variable = require('./variable');
const ArrayInit = require('./arrayInit');

let __controlStatus = null;
let __returnValue = null;

const ControlStatus = {
    CONTINUE: 1,
    BREAK: 2,
    RETURN: 3
};

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

class Evaluator {
    constructor() {
        this.scopes = new Scopes();
    }

    evalDeclaration(astDecl) {
        assert(astDecl.astType === Ast.AstDeclaration,
                    `internal error: evalDeclaration(): param is NOT AstDeclaration`);
        assert(astDecl.ident !== null,
                    `internal error: evalDeclaration(): param has null ident`);

        // 检查是否有重名的变量存在
        if (this.scopes.findIdent(astDecl.ident) !== null) {
            platform.programFail(`redeclaration of ${astDecl.ident}`);
        }

        const dataType = this.createDataType(astDecl.dataType.astBaseType,
                                                astDecl.dataType.numPtrs,
                                                astDecl.dataType.ident);
        for (let idx of astDecl.arrayIndexes) {
            dataType.arrayIndexes.push(this.evalExpressionInt(idx));
        }

        // 创建变量
        const variable = new Variable(dataType, astDecl.ident, null);

        if (astDecl.rhs !== null) {
            if (astDecl.rhs.astType === Ast.AstArrayInitializer) {
                assert(astDecl.arrayIndexes.length !== 0,
                                    `internal: evalDeclaration(): NOT an array`);

                // 将初始化列表展开，并且对元素进行表达式求值
                let initializer = new ArrayInit(astDecl.arrayIndexes, astDecl.rhs.initValues);
                let initValues = initializer.doInit();
                initValues.map(this.evalExpression);

                // 对数组进行初始化
                variable.initArrayValue(initValues);
            } else {
                let varRHS = this.evalExpression(astDecl.rhs);
                variable.initScalarValue(varRHS);
            }
        } else {
            variable.initDefaultValue();
        }

        // 将变量加入到当前scopes
        this.scopes.addIdent(astDecl.ident, variable);
    } // end of evalDeclaration

    // 处理自增/自减运算
    evalSelfOp(astIdent, isPostfix, isIncr) {
        // 通过AST获取变量，此变量必须存在于当前有效的scopes中
        const variable = this.getVariable(astIdent.ident);
        if (variable === null) {
            platform.programFail(`${astIdent.ident} undeclared`);
        }

        if (variable.arrayIndexes.length !== 0 && astIdent.arrayIndexes.length === 0) {
            // 数组本身不能进行自增操作
            if (astIdent.token === Token.TokenIncrement) {
                platform.programFail(`array can not be used as increment operand`);
            } else {
                platform.programFail(`array can not be used as decrement operand`);
            }
        }

        // 检查++/--操作能否在此variable或其元素上进行
        const ok = variable.isNumericType();
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
            const tempVariable = variable.createElementVariable(astIdent.accessIndexes);
            variable.setValueIncr(astIdent.accessIndexes, delta);
        } else {
            variable.setValueIncr(astIdent.accessIndexes, delta);
            const tempVariable = variable.createElementVariable(astIdent.accessIndexes);
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

    getVariable(name) {
        let v = this.scopes.findIdent(name);
        if (v === undefined) {
            v = null;
        }
        return v;
    }

    // 取地址运算符
    evalTakeAddress(astTakeAddress) {
        const astIdent = astTakeAddress.astIdent;

        // 通过AST获取变量，此变量必须存在于当前有效的scopes中
        const variable = this.getVariable(astIdent.ident);
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
        const variable = this.getVariable(astIdent.ident);
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
        const variable = this.getVariable(astIdent.ident);
        if (variable === null) {
            platform.programFail(`${astIdent.ident} undeclared`);
        }

        variable.setValueMinus(null, astIdent.accessIndexes);
        return variable.createElementVariable(astIdent.accessIndexes);
    }

    evalTakeNot(astNot) {
        const astIdent = astNot.astIdent;
        const variable = this.getVariable(astIdent.ident);
        if (variable === null) {
            platform.programFail(`${astIdent.ident} undeclared`);
        }

        variable.setValueNot(null, astIdent.accessIndexes);
        return variable.createElementVariable(astIdent.accessIndexes);
    }

    evalTakeExor(astExor) {
        const astIdent = astExor.astIdent;
        const variable = this.getVariable(astIdent.ident);
        if (variable === null) {
            platform.programFail(`${astIdent.ident} undeclared`);
        }

        variable.setValueExor(null, astIdent.accessIndexes);
        return variable.createElementVariable(astIdent.accessIndexes);
    }

    evalVariableFromAstIdent(astIdent) {
        const variable = this.getVariable(astIdent.ident);
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
    } // end of assertValidExpression

    // 将表达式列表中的元素进行合法性检查和转换
    expressionMap(elementList) {
        if (elementList.length === 0) {
            return null;
        }

        const expressionList = [];
        let astType;
        let token = null;
        let value = null;
        for (let astElement of elementList) {
            token = null;
            if (astElement.astType === Ast.AstIdentifier) {
                value = this.evalVariableFromAstIdent(astElement);
                astType = Ast.AstVariable;
            } else if (astElement.astType === Ast.AstTakeAddress) {
                value = this.evalTakeAddress(astElement);
                astType = Ast.AstVariable;
            } else if (astElement.astType === Ast.AstTakeValue) {
                value = this.evalTakeValue(astElement);
                astType = Ast.AstVariable;
            } else if (astElement.astType === Ast.AstUMinus) {
                value = this.evalTakeUMinus(astElement);
                astType = Ast.AstVariable;
            } else if (astElement.astType === Ast.AstUnaryNot) {
                value = this.evalTakeNot(astElement);
                astType = Ast.AstVariable;
            } else if (astElement.astType === Ast.AstUnaryExor) {
                value = this.evalTakeExor(astElement);
                astType = Ast.AstVariable;
            } else if (astElement.astType === Ast.AstOperator) {
                astType = Ast.AstOperator;
                token = astElement.token;
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
                    //case Token.TokenQuestionMark:
                    //case Token.TokenColon:
                        value = prio.get(astElement.token);
                        assert(value !== undefined, `operator ${astElement.token} has no prio`);
                        break;
                    default:
                        assert(false, `Unrecognized operator type ${astElement.token}`);
                }
            } else {
                expressionList.push(astElement);
                continue;
            }

            expressionList.push({astType: astType, token: token, value: value});
        }

        return expressionList;
    } // end of expressionMap

    // 对表达式元素进行求值
    expressionReduce(expressionList) {
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
                    this.expressionReduceStack(stack, prio);
                    bestPrio = prio;

                    // 对"||"操作符进行特殊处理，如果前半部分表达式为true则直接返回
                    if (elem.token === Token.TokenArithmeticOr) {
                        if (stack.length !== 1) {
                            platform.programFail(`invalid expression`);
                        }

                        const boolValue = stack[0].getNumericValue();
                        if (boolValue === null) {
                            platform.programFail('expression before "||" can NOT be evaluated to boolean');
                        }

                        if (boolValue !== 0) {
                            return stack[0];
                        }
                    }
                }
            }

            stack.push(elem);
        }

        this.expressionReduceStack(stack, 10000);

        if (stack.length !== 1) {
            platform.programFail(`invalid expression`);
        }

        /*
        if (stack[0].astType !== Ast.AstIdentifier) {
            platform.programFail(`invalid expression`);
        }
        */

        return stack[0];
    } // end of expressionReduce

    expressionReduceStack(stack, basePrio) {
        assert(stack.length !==0, `internal error: stack.length === 0`);
        assert(stack.length % 2 === 1, `internal error: stack.length is even`);

        if (stack.length === 1) {
            return stack;
        }

        let op;
        let lhs;
        let rhs;
        let result = null;
        while (stack.length > 1) {
            op = stack[-2];

            assert(op.astType === Ast.AstOperator);
            if (op.value > basePrio) {
                break;
            }

            rhs = stack.pop();
            // 由于"||"操作符的"shortcut"特性，将潜在的修改变量的单目操作挪到这里
            rhs = this.evalUnaryOperator(rhs);

            stack.pop();
            lhs = stack.pop();
            lhs = this.evalUnaryOperator(lhs);

            switch (op.token) {
                case Token.TokenAsterisk:
                case Token.TokenSlash:
                case Token.TokenModulus:
                case Token.TokenPlus:
                case Token.TokenMinus:
                case Token.TokenShiftLeft:
                case Token.TokenShiftRight:
                case Token.TokenLessThan:
                case Token.TokenLessEqual:
                case Token.TokenGreaterThan:
                case Token.TokenGreaterEqual:
                case Token.TokenEqual:
                case Token.TokenNotEqual:
                case Token.TokenAmpersand:
                case Token.TokenArithmeticOr:
                case Token.TokenArithmeticExor:
                case Token.TokenLogicalAnd:
                case Token.TokenLogicalOr:
                    result = this.evalBinaryOperator(lhs, rhs, opToken);
                    break;

                /*
                case Token.TokenQuestionMark:
                    return stack;
                case Token.TokenColon:
                    let questionMark = stack[-4];
                    if (questionMark !== undefined && questionMark.astType === Ast.AstOperator) {
                        if (questionMark.token !== Token.TokenQuestionMark) {
                            platform.programFail(`Unrecognized operator token ${questionMark.token},
                                                    maybe you want to specify '?' operator`);
                        }
                        stack.pop();
                        let conditional = stack.pop();
                        if (conditional === undefined) {
                            platform.programFail(`expect expression before '?'`);
                        }
                        result = Variable.evalTernaryOperator(conditional, lhs, rhs);
                    } else {
                        // todo
                    }
                    break;
                */
                default:
                    assert(false, `internal:expressionReduceStack():switch(${opToken}): unexpected token`);
                    break;
            }

            stack.push(result);
        }

        return stack;
    } // end of expressionReduceStack

    // 对表达式进行求值，返回variable
    evalExpression(AstExpression, needReturn) {
        let astExpr = AstExpression;
        let result;
        let expList;

        do {
            // 先处理各类赋值操作
            if (astExpr.elementList.length === 1 &&
                  astExpr.elementList[0].astType === Ast.AstAssign) {
                let astAssign = astExpr.elementList[0];
                result = this.evalAssignOperator(astAssign.lhs,astAssign.rhs, astAssign.assignToken);    
            } else {
                // 再处理三目运算符
                while (astExpr.elementList.length === 1 &&
                      astExpr.elementList[0].astType === Ast.AstTernary) {
                    let astTernary = astExpr.elementList[0];
                    let condition = this.evalExpressionBoolean(astTernary.conditional);
                    astExpr.elementList = condition ? astTernary.expr1.elementList :
                                                        astTernary.expr2.elementList;
                }

                expList = this.expressionMap(astExpr.elementList);
                result = this.expressionReduce(expList);
            }
            astExpr = astExpr.astNextExpression;
        } while (astExpr !== null);

        if (result.astType !== Ast.AstConstant && result.astType !== Ast.AstVariable) {
            assert(false, `internal: evalExpression(): Unexpected astType ${result.astType}`);
        }

        if (needReturn) {
            if (result.astType === Ast.AstConstant) {
                result = Variable.createNumericVariable(BaseType.TypeInt, null, result.value);
            } else if (result.astType === Ast.AstVariable) {
                result = result.value;
            }

            return result;
        }
    } // end of evalExpression

    evalExpressionInt(AstExpression) {
        const result = this.evalExpression(AstExpression);
        const value = result.getNumericValue();

        if (value === null) {
            platform.programFail('not a numeric expression');
        }

        return value;
    }
    evalExpressionBoolean(AstExpression) {
        const result = this.evalExpression(AstExpression);
        const value = result.getNumericValue();

        if (value === null) {
            platform.programFail('expression can NOT be evaluated to boolean');
        }

        return (value !== 0);
    }

    // 进行单目运算符、函数调用，子表达式的计算
    // 用于规避"||"操作符的"shortcut"特性
    evalUnaryOperator(ast) {
        let result = ast;

        switch (ast.astType) {
            case Ast.AstPrefixOp:
                if (ast.token === Token.TokenIncrement) {
                    result = this.evalPrefixIncr(ast.ident);
                } else {
                    result = this.evalPrefixDecr(ast.ident);
                }
                break;
            case Ast.AstPostfixOp:
                if (ast.token === Token.TokenIncrement) {
                    result = this.evalPostfixIncr(ast.ident);
                } else {
                    result = this.evalPostfixDecr(ast.ident);
                }
                break;
            case Ast.AstFuncCall:
                break;
            case Ast.AstExpression:
                result = this.evalExpression(ast);
                break;
            default:
                break;
        }

        return {
            astType: Ast.AstVariable,
            token: null,
            value: result
        };
    } // end of evalUnaryOperator

    evalBinaryOperator(lhs, rhs, opToken) {
        let val1;
        let val2;
        let result;
        let baseType;
        let hasFP = false;

        if (lhs.astType === Ast.AstVariable) {
            val1 = lhs.value.getNumericValue();
            if (val1 === null) {
                platform.programFail(`left side of operation is NOT a valid number`);
            }
            if (lhs.value.dataType.baseType === BaseType.TypeFP) {
                hasFP = true;
            }
        } else if (lhs.astType === Ast.AstConstant) {
            if (lhs.token !== Token.TokenIntegerConstant && lhs.token !== Token.TokenFPConstant) {
                platform.programFail(`expect a numeric constant or value`);
            }
            val1 = lhs.value;
            if (lhs.token === Token.TokenFPConstant) {
                hasFP = true;
            }
        }

        if (rhs.astType === Ast.AstVariable) {
            val2 = rhs.value.getNumericValue();
            if (val2 === null) {
                platform.programFail(`right side of operation is NOT a valid number`);
            }
            if (rhs.value.dataType.baseType === BaseType.TypeFP) {
                hasFP = true;
            }
        } else if (rhs.astType === Ast.AstConstant) {
            if (rhs.token !== Token.TokenIntegerConstant && rhs.token !== Token.TokenFPConstant) {
                platform.programFail(`expect a numeric constant or value`);
            }
            val2 = rhs.value;
            if (rhs.token === Token.TokenFPConstant) {
                hasFP = true;
            }
        }

        switch (opToken) {
            case Token.TokenAsterisk: // 乘法
                result = val1 * val2;
                baseType = hasFP ? BaseType.TypeFP : BaseType.TypeUnsignedLong;
                break;
            case Token.TokenSlash: // 除法
                if (val2 === 0) {
                    platform.programFail(`division by zero`);
                }
                result = val1 / val2;
                baseType = hasFP ? BaseType.TypeFP : BaseType.TypeUnsignedLong;
                break;
            case Token.TokenModulus: // 取模
                if (val2 === 0) {
                    platform.programFail(`division by zero`);
                }
                if (hasFP) {
                    platform.programFail(`invalid operands to binary %`);
                }
                result = val1 % val2;
                baseType = BaseType.TypeUnsignedLong;
                break;
            case Token.TokenPlus: // 加法
                result = val1 + val2;
                baseType = hasFP ? BaseType.TypeFP : BaseType.TypeUnsignedLong;
                break;
            case Token.TokenMinus: // 减法
                result = val1 - val2;
                baseType = hasFP ? BaseType.TypeFP : BaseType.TypeUnsignedLong;
                break;
            case Token.TokenShiftLeft: // 左移
                if (hasFP) {
                    platform.programFail(`invalid operands to binary <<`);
                }
                result = val1 << val2;
                baseType = BaseType.TypeUnsignedLong;
                break;
            case Token.TokenShiftRight: // 右移
                if (hasFP) {
                    platform.programFail(`invalid operands to binary >>`);
                }
                result = val1 >> val2;
                baseType = BaseType.TypeUnsignedLong;
                break;
            case Token.TokenLessThan: // 小于
                result = val1 < val2;
                baseType = BaseType.TypeUnsignedLong;
                break;
            case Token.TokenLessEqual: // 小于等于
                result = val1 <= val2;
                baseType = BaseType.TypeUnsignedLong;
                break;
            case Token.TokenGreaterThan: // 大于
                result = val1 > val2;
                baseType = BaseType.TypeUnsignedLong;
                break;
            case Token.TokenGreaterEqual: // 大于等于
                result = val1 >= val2;
                baseType = BaseType.TypeUnsignedLong;
                break;
            case Token.TokenEqual: // 等于
                result = val1 === val2;
                baseType = BaseType.TypeUnsignedLong;
                break;
            case Token.TokenNotEqual: // 不等于
                result = val1 !== val2;
                baseType = BaseType.TypeUnsignedLong;
                break;
            case Token.TokenAmpersand: // 按位与
                if (hasFP) {
                    platform.programFail(`invalid operands to binary &`);
                }
                result = val1 & val2;
                baseType = BaseType.TypeUnsignedLong;
                break;
            case Token.TokenArithmeticOr: // 按位或
                if (hasFP) {
                    platform.programFail(`invalid operands to binary |`);
                }
                result = val1 | val2;
                baseType = BaseType.TypeUnsignedLong;
                break;
            case Token.TokenArithmeticExor: // 按位异或
                if (hasFP) {
                    platform.programFail(`invalid operands to binary ^`);
                }
                result = val1 ^ val2;
                baseType = BaseType.TypeUnsignedLong;
                break;
            case Token.TokenLogicalAnd: // 逻辑与
                result = val1 && val2;
                baseType = BaseType.TypeUnsignedLong;
                break;
            case Token.TokenLogicalOr: // 逻辑或
                result = val1 || val2;
                baseType = BaseType.TypeUnsignedLong;
                break;
            case Token.TokenQuestionMark:
                // todo
                break;
            case Token.TokenColon:
                // todo
                break;
            default:
                assert(false, `internal:evalBinaryOperator(): Unexpected operator token ${opToken}`);
                break;
        }

        const variable = Variable.createNumericVariable(baseType, null, result);
        return {
            astType: Ast.AstVariable,
            token: null,
            value: variable
        };
    } // end of evalBinaryOperator

    /*
    // 赋值"x = y"
    evalAssign(astIdent, astExpression) {
        let value;
        const variable = this.getVariable(astIdent.ident);
        if (variable === null) {
            platform.programFail(`${astIdent.ident} undeclared`);
        }
        // 变量必须是左值
        if (variable.name === null) {
            platform.programFail(`lvalue required`);
        }

        const rhs = this.evalExpression(astExpression);
        switch (rhs.astType) {
            case Ast.AstVariable:
            case Ast.AstConstant:
                return variable.assignConstant(astIdent.accessIndexes, rhs.value);
                break;
            default:
                assert(false, `internal: evalAssign(): Unexpected astType ${rhs.astType}`);
                break;
        }
    } // end of evalAssign
    */

    evalAssignOperator(astIdent, astExpression, assignToken) {
        let rhs;
        let ret;

        const variable = this.getVariable(astIdent.ident);
        if (variable === null) {
            platform.programFail(`${astIdent.ident} undeclared`);
        }
        // 变量必须是左值
        if (variable.name === null) {
            platform.programFail(`lvalue required`);
        }

        rhs = this.evalExpression(astExpression);

        if (assignToken === undefined) {
            assignToken = Token.TokenAssign;
        }

        if (assignToken === Token.TokenAssign) {
            return variable.assign(astIdent.accessIndexes, rhs);
        }
        // 除了"="赋值以外，其他赋值类型，如"+=", ">>="等，要求右值必须为数值类型
        if (!rhs.isNumericType()) {
            platform.programFail(`right hand side of "${Token.getTokenName(assignToken)}"
                                    must be a numeric value`);
        }

        const n = rhs.getValue();
        const num = new Number(n);
        if (!num.isInteger()) {
            platform.programFail(`integer value expected for RHS`);
        }

        switch (assignToken) {
            case Token.TokenAddAssign:
            case Token.TokenSubtractAssign:
                if (variable.isPtrType()) {
                    return variable.handlePtrChange(astIdent.accessIndexes, n, assignToken);
                }
            case Token.TokenMultiplyAssign:
            case Token.TokenDivideAssign:
            case Token.TokenModulusAssign:
            case Token.TokenShiftLeftAssign:
            case Token.TokenShiftRightAssign:
            case Token.TokenArithmeticAndAssign:
            case Token.TokenArithmeticOrAssign:
            case Token.TokenArithmeticExorAssign:
                if (!variable.isNumericType()) {
                    platform.programFail(`left hand side of "${Token.getTokenName(assignToken)}"
                                            must be a numeric value`);
                }
                break;
            default:
                assert(false, `internal: evalAssignOperator(): Unexpected assignToken ${assignToken}`);
                break;
        }

        return variable.setValue(astIdent.accessIndexes, n, assignToken);
    } // end of evalAssignOperator

    evalBlock(astBlock) {
        this.scopes.pushScope(Ast.AstBlock);
        for (let statement of astBlock.statements) {
            /*
            if (statement.astType === Ast.AstContinue) {
                __controlStatus = ControlStatus.CONTINUE;
                break;
            }
            if (statement.astType === Ast.AstBreak) {
                __controlStatus = ControlStatus.BREAK;
                break;
            }
            // RETURN只可能发生在block中(switch语句中也要特殊处理)
            if (statement.astType === Ast.AstReturn) {
                __returnValue = this.evalExpression(statement.value);
                __controlStatus = ControlStatus.RETURN;
                return ;
            }
            */

            evalDispatch(statement);

            // 判断执行的语句是否为continue, break, return
            if (statement.astType === Ast.AstContinue) {
                break;
            }
            if (statement.astType === Ast.AstBreak) {
                break;
            }
            if (__controlStatus === ControlStatus.RETURN) {
                return ;
            }
        }
        this.scopes.popScope();
    }

    evalBody(astBody) {
        switch (astBody.astType) {
            case Ast.AstExpression:
                this.evalExpression(astBody);
                break;
            case Ast.AstBlock:
                this.evalBlock(astBody);
                break;
            default:
                assert(false, `internal: evalBody(): unexpected Ast Type ${astBody.astType}`);
                break;
        }

        return ;
    }

    evalIf(astIf) {
        const condition = this.evalExpressionBoolean(astIf.conditional);

        if (condition) {
            this.evalBody(astIf.ifBranch);
        } else {
            if (astIf.elseBranch.astType === Ast.AstIf) {
                this.evalIf(astIf.elseBranch);
            } else {
                this.evalBody(astIf.elseBranch);
            }
        }

        return ;
    }

    evalWhile(astWhile) {
        while (true) {
            const condition = this.evalExpressionBoolean(astWhile.conditional);
            if (!condition) {
                break;
            }

            this.evalBody(astWhile.body);
            if (__controlStatus === ControlStatus.CONTINUE) {
                // 在循环中终结continue
                __controlStatus = null;
                break ;
            }
            if (__controlStatus === ControlStatus.BREAK) {
                // 在循环中终结break
                __controlStatus = null;
                break;
            }
            if (__controlStatus === ControlStatus.RETURN) {
                return ;
            }
        }
    }

    evalDoWhile(astDoWhile) {
        while (true) {
            this.evalBody(astWhile.body);
            if (__controlStatus === ControlStatus.CONTINUE) {
                // 在循环中终结continue
                __controlStatus = null;
                break ;
            }
            if (__controlStatus === ControlStatus.BREAK) {
                // 在循环中终结break
                __controlStatus = null;
                break;
            }
            if (__controlStatus === ControlStatus.RETURN) {
                return ;
            }

            const condition = this.evalExpressionBoolean(astWhile.conditional);
            if (!condition) {
                break;
            }
        }
    }

    evalFor(astFor) {
        this.pushScope(Ast.AstFor);
        if (astFor.initial !== null) {
            this.evalDeclaration(astFor.initial);
        }

        while(this.evalExpressionBoolean(astFor.conditional)) {
            this.evalBody(astFor.body);
            if (__controlStatus === ControlStatus.CONTINUE) {
                // 在循环中终结continue
                __controlStatus = null;
                break ;
            }
            if (__controlStatus === ControlStatus.BREAK) {
                // 在循环中终结break
                __controlStatus = null;
                break;
            }
            if (__controlStatus === ControlStatus.RETURN) {
                return ;
            }

            this.evalExpression(astFor.finalExpression);
        }
        this.popScope();
    }

    /*
    const astSwitch = {
        astType: Ast.AstSwitch,
        value: null, // astExpression
        cases: [], // astExpression
        default: null, // astBlock
        pushCase: function(expression, block) {
            this.cases.push({
                expression: expression, // astExpression
                block: block // astBlock
            });
        }
    };
    */
    evalSwitch(astSwitch) {
        let matched = false;
        let isDefault = true;
        const value = this.evalExpression(astSwitch.value);

        switchStatement: // a label
        for (let v of astSwitch.cases) {
            if (!matched) {
                let caseValue = this.evalExpression(v.expression);
                matched = this.evalBinaryOperator(value, caseValue, Token.TokenEqual).value.getNumericValue();
            }
            if (matched) {
                isDefault = false;
                for (let statement of v.block.statements) {
                    this.evalDispatch(statement);
                    if (statement.astType === Ast.AstContinue) {
                        break switchStatement; // jump to the label
                    }
                    if (statement.astType === Ast.AstBreak) {
                        break switchStatement; // jump to the label
                    }
                    if (__controlStatus === ControlStatus.RETURN) {
                        return ;
                    }
                }
            }
        }

        // 处理default的情况
        if (isDefault) {
            for (let statement of astSwitch.default.statements) {
                this.evalDispatch(statement);
                if (statement.astType === Ast.AstContinue) {
                    break;
                }
                if (statement.astType === Ast.AstBreak) {
                    break;
                }
                if (__controlStatus === ControlStatus.RETURN) {
                    return ;
                }
            }
        }
    }

    // 根据AST类型进行分发处理
    evalDispatch(astNode) {
        switch (astNode.astType) {
            case Ast.AstDeclaration:
                this.evalDeclaration(astNode);
                break;
            case Ast.AstExpression:
                this.evalExpression(astNode);
                break;
            case Ast.AstBlock:
                this.evalBlock(astNode);
                break;

            case Ast.AstIf:
                this.evalIf(astNode);
                break;
            case Ast.AstWhile:
                this.evalWhile(astNode);
                break;
            case Ast.AstDoWhile:
                this.evalDoWhile(astNode);
                break;
            case Ast.AstFor:
                this.evalFor(astNode);
                break;
            case Ast.AstSwitch:
                break;

            case Ast.AstStruct:
                break;
            case Ast.AstUnion:
                break;
            case Ast.AstTypedef:
                break;

            case Ast.AstContinue:
                if (!this.scopes.hasAnyScope(Ast.AstFor, Ast.AstWhile, Ast.AstDoWhile)) {
                    platform.programFail(`continue statement not within a loop`);
                }
                __controlStatus = ControlStatus.CONTINUE;
                break;
            case Ast.AstBreak:
                if (!this.scopes.hasAnyScope(Ast.AstFor, Ast.AstWhile, Ast.AstDoWhile, Ast.AstSwitch)) {
                    platform.programFail(`break statement not within loop or switch`);
                }
                __controlStatus = ControlStatus.BREAK;
                break;
            case Ast.AstReturn:
                // todo
                __returnValue = this.evalExpression(statement.value);
                __controlStatus = ControlStatus.RETURN;
                //platform.programFail(`return statement not within a function`);
                break;

            case Ast.AstFuncDef:
                break;
            case Ast.AstFuncCall:
                break;

            default:
                break;
        }

        return ;
    }


}
