const assert = require('assert');
const Token = require('./interpreter');
const BaseType = require('./basetype');
const Scopes = require('./scopes');
const platform = require('./platform');
const Ast = require('./ast');
const Variable = require('./variable');
const ArrayInit = require('./arrayInit');
const Parser = require('./parser');
const debug = require('./debug');

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

        const dataType = Variable.createDataType(astDecl.dataType.astBaseType,
                                                astDecl.dataType.numPtrs,
                                                astDecl.dataType.ident);
        dataType.arrayIndexes = astDecl.arrayIndexes.map(this.evalExpressionInt, this);
        /*
        for (let idx of astDecl.arrayIndexes) {
            dataType.arrayIndexes.push(this.evalExpressionInt(idx));
        }
        */

        // 创建变量
        const variable = new Variable(dataType, astDecl.ident, null);
        variable.initDefaultValue();

        if (astDecl.rhs !== null) {
            // 数组初始化序列
            if (astDecl.rhs.astType === Ast.AstArrayInitializer) {
                // 检查变量是否为数组
                if (astDecl.arrayIndexes.length === 0) {
                    platform.programFail(`variable '${astDecl.ident}' is NOT of array type`);
                }
                // 将初始化列表展开，并且对元素进行表达式求值
                let initializer = new ArrayInit(dataType.arrayIndexes, astDecl.rhs.initValues);
                let initValues = initializer.doInit();
                initValues = initValues.map((v) => v === null ? null : this.evalExpressionRHS(v), this);

                // 对数组进行初始化
                variable.initArrayValue(initValues);
            } else {
                // 检查变量是否为数组
                if (astDecl.arrayIndexes.length !== 0) {
                    platform.programFail(`invalid initializer: variable '${astDecl.ident}' is an array`);
                }
                let varRHS = this.evalExpressionRHS(astDecl.rhs);
                variable.initScalarValue(varRHS);
            }
        }

        // 将变量加入到当前scopes
        this.scopes.addIdent(astDecl.ident, variable);
    } // end of evalDeclaration

    // 处理自增/自减运算，指针类型和数值类型分别处理
    evalSelfOp(astOperand, isPostfix, isIncr) {
        const n = (isIncr ? 1 : -1);
        let varResult;

        if (astOperand.variable.isPtrType()) {
            if (isPostfix) {
                varResult = astOperand.variable.createElementVariable(astOperand.accessIndexes);
                astOperand.variable.handlePtrChange(astOperand.accessIndexes, n, Token.TokenIncrement);
            } else {
                astOperand.variable.handlePtrChange(astOperand.accessIndexes, n, Token.TokenIncrement);
                varResult = astOperand.variable.createElementVariable(astOperand.accessIndexes);
            }
        } else if (astOperand.variable.isNumericType()) {
            if (isPostfix) {
                varResult = astOperand.variable.createElementVariable(astOperand.accessIndexes);
                astOperand.variable.setValueIncr(astOperand.accessIndexes, n);
            } else {
                astOperand.variable.setValueIncr(astOperand.accessIndexes, n);
                varResult = astOperand.variable.createElementVariable(astOperand.accessIndexes);
            }
        } else {
            if (isIncr) {
                platform.programFail(`wrong type argument to increment operand`);
            } else {
                platform.programFail(`wrong type argument to decrement operand`);
            }
        }

        return {
            astType: Ast.AstVariable,
            variable: varResult,
            accessIndexes: []
        };


        /*
        let variable;
        let varResult;
		let accessIndexes;
        const n = (isIncr ? 1 : -1);

        variable = this.getVariable(astIdent.ident);
        if (variable === null) {
            platform.programFail(`${astIdent.ident} undeclared`);
        }

        accessIndexes = astIdent.accessIndexes.map(this.evalExpressionInt, this);
        ({variable, accessIndexes} = variable.getReferrence(accessIndexes));
        if (variable.isPtrType()) {
            variable.handlePtrChange(accessIndexes, n, Token.TokenIncrement);
            varResult = variable.createElementVariable(accessIndexes);
        } else if (variable.isNumericType()) {
            if (isPostfix) {
                varResult = variable.createElementVariable(accessIndexes);
                variable.setValueIncr(accessIndexes, n);
            } else {
                variable.setValueIncr(accessIndexes, n);
                varResult = variable.createElementVariable(accessIndexes);
            }
        } else {
            if (isIncr) {
                platform.programFail(`wrong type argument to increment operand`);
            } else {
                platform.programFail(`wrong type argument to decrement operand`);
            }
        }

        return varResult;
        */
    }

    evalPostfixIncr(astOperand) {
        return this.evalSelfOp(astOperand, true, true);
    }

    evalPostfixDecr(astOperand) {
        return this.evalSelfOp(astOperand, true, false);
    }

    evalPrefixIncr(astOperand) {
        return this.evalSelfOp(astOperand, false, true);
    }

    evalPrefixDecr(astOperand) {
        return this.evalSelfOp(astOperand, false, false);
    }

    getVariable(name) {
        let v = this.scopes.findIdent(name);
        if (v === undefined) {
            v = null;
        }
        return v;
    }

    // 取地址运算符
    evalTakeAddress(astOperand) {
        /*
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

        const accessIndexes = astIdent.accessIndexes.map(this.evalExpressionInt, this);
        //console.log('accessIndexes:', accessIndexes);
        return variable.createElementAddressVariable(accessIndexes);
        */
        const varAddress = astOperand.variable.createElementAddressVariable(astOperand.accessIndexes);
        return {
            astType: Ast.AstVariable,
            variable: varAddress,
            accessIndexes: []
        };
    }

    evalTakeValue(astOperand) {
        /*
        const astIdent = astTakeValue.astIdent;
        let variable = this.getVariable(astIdent.ident);
        if (variable === null) {
            platform.programFail(`${astIdent.ident} undeclared`);
        }

		const msg = `ambiguity: please specify complete indexes`;
        let accessIndexes = astIdent.accessIndexes.map(this.evalExpressionInt, this);
		({variable, accessIndexes} = variable.getReferrence(accessIndexes, false, msg));

        // 变量或变量元素的类型必须是指针
        if (!variable.isPtrType()) {
            platform.programFail(`lvalue is NOT a pointer`);
        }

        const ptr = variable.getValue(accessIndexes);
        if (ptr === 0) {
            platform.programFail(`dereferrence to a NULL pointer`);
        }

        return ptr.refTo.createElementVariable(ptr.indexes);
        */

        const ptr = astOperand.variable.getValue(astOperand.accessIndexes);
        if (ptr === 0) {
            platform.programFail(`dereferrence to a NULL pointer`);
        }

        // 取值操作返回左值
        return {
            astType: Ast.AstVariable,
            variable: ptr.refTo,
            accessIndexes: ptr.indexes
        };
    }

    evalTakeUMinus(astOperand) {
        const variable = astOperand.variable.createElementVariable(astOperand.accessIndexes);
        if (!variable.isNumericTypeNonArray()) {
            platform.programFail(`wrong type argument to unary minus`);
        }
        variable.setValueUMinus();

        return {
            astType: Ast.AstVariable,
            variable: variable,
            accessIndexes: []
        };
    }

    evalTakeNot(astOperand) {
        // '!'操作符不关心操作数的具体类型，这里直接取值
        const value = astOperand.variable.getValue(astOperand.accessIndexes);
        const variable = Variable.createNumericVariable(BaseType.TypeInt, null, !value);
        return {
            astType: Ast.AstVariable,
            variable: variable,
            accessIndexes: []
        };
    }

    evalTakeExor(astOperand) {
        const variable = astOperand.variable.createElementVariable(astOperand.accessIndexes);
        if (!variable.isNumericTypeNonArray()) {
            platform.programFail(`wrong type argument to bit-complement`);
        }
        variable.setValueExor();

        return {
            astType: Ast.AstVariable,
            variable: variable,
            accessIndexes: []
        };
    }

    variableRefFromAstIdent(astIdent, autoFillIndexes) {
        let variable = this.getVariable(astIdent.ident);
        if (variable === null) {
            platform.programFail(`${astIdent.ident} undeclared`);
        }

        let accessIndexes = astIdent.accessIndexes.map(this.evalExpressionInt, this);
		const varRef = variable.createVariableRef(accessIndexes, autoFillIndexes);
		return {
			astType: Ast.AstVariable,
			variable: varRef.variable,
			accessIndexes: varRef.accessIndexes
		};
    }

	variableRefFromAstConstant(astConst) {
		let varRef;
		let variable;
		let baseType;

		if (astConst.token === Token.TokenIntegerConstant) {
			baseType = BaseType.TypeInt;
		} else if (astConst.token === Token.TokenFPConstant) {
			baseType = BaseType.TypeFP;
		}

		variable = Variable.createNumericVariable(baseType, null, astConst.value);
		varRef = this.variableRefFromVariable(variable, []);
		return varRef;
	}

    variableRefFromVariable(variable, accessIndexes) {
		const varRef = variable.createVariableRef(accessIndexes);
		return {
			astType: Ast.AstVariable,
			variable: varRef.variable,
			accessIndexes: varRef.accessIndexes
		};
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
		let newElement = null;
        for (let astElement of elementList) {
			newElement = astElement;

            if (astElement.astType === Ast.AstOperator) {
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
                        const value = prio.get(astElement.token);
                        assert(value !== undefined, `operator ${astElement.token} has no prio`);
						newElement = {
							astType: Ast.AstOperator,
							token: astElement.token,
							value: value
						};
                        break;
                    default:
                        assert(false, `Unrecognized operator type ${astElement.token}`);
                }
            } else {
                /*
				switch (astElement.astType) {
					case Ast.AstIdentifier:
					case Ast.AstPostfixOp:
					case Ast.AstPrefixOp:
					case Ast.AstTakeAddress:
					case Ast.AstTakeValue:
					case Ast.AstUMinus:
					case Ast.AstUnaryNot:
					case Ast.AstUnaryExor:
						//newElement = this.expressionConvert2Variable(astElement);
						break;
					default:
						break;
				}
                */
			}

            expressionList.push(newElement);
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
                    if (elem.token === Token.TokenLogicalOr) {
                        if (stack.length !== 1) {
                            platform.programFail(`invalid expression`);
                        }

                        const value = stack[0].variable.getValue(stack[0].accessIndexes);
                        if (value) {
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

        return stack[0];
    } // end of expressionReduce

    /* 将栈中高于指定优先级的操作符执行相应操作
     * 主要是二元操作，但是由于"||"操作符的"shortcut"特性，将修改变量的单目操作也放到这里
     */
    expressionReduceStack(stack, basePrio) {
        assert(stack.length !==0, `internal error: stack.length === 0`);
        assert(stack.length % 2 === 1, `internal error: stack.length is even`);

        if (stack.length === 1) {
            stack[0] = this.evalUnaryOperator(stack[0]);
            return stack;
        }

        let op;
        let lhs;
        let rhs;
        let result = null;
        while (stack.length > 1) {
            op = stack[stack.length-2];

            assert(op.astType === Ast.AstOperator);
            if (op.value > basePrio) {
                break;
            }

            rhs = stack.pop();
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
                    result = this.evalBinaryOperator(lhs, rhs, op.token);
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
    evalExpression(AstExpression) {
        let astExpr = AstExpression;
        let result;
        let expList;

        do {
            // 先处理各类赋值操作
            if (astExpr.elementList.length === 1 &&
                  astExpr.elementList[0].astType === Ast.AstAssign) {
                const astAssign = astExpr.elementList[0];
                result = this.evalAssignOperator(astAssign.lhs, astAssign.rhs, astAssign.assignToken);    
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
            astExpr = astExpr.next;
        } while (astExpr !== null);

        return result;
    } // end of evalExpression

    evalExpressionRHS(AstExpression) {
        const result = this.evalExpression(AstExpression);
        return result.variable.createElementVariable(result.accessIndexes);
    }

    evalExpressionInt(AstExpression) {
        const result = this.evalExpression(AstExpression);

        if (!result.variable.isNumericTypeNonArray()) {
            platform.programFail('not a numeric expression');
        }

        return result.variable.getValue();
    }

    evalExpressionBoolean(AstExpression) {
        const result = this.evalExpression(AstExpression);

        if (!result.variable.isNumericTypeNonArray()) {
            platform.programFail('expression can NOT be evaluated to boolean');
        }

        return result.variable.getValue() !== 0;
    }

    // 进行单目运算符、函数调用，子表达式的计算
    evalUnaryOperator(astUnary) {
		let varRef = astUnary;
        let operand;

        switch (astUnary.astType) {
            case Ast.AstFuncCall:
                varRef = this.evalFuncCall(astUnary);
                break;
            case Ast.AstExpression:
                varRef = this.evalExpression(astUnary);
                break;
			case Ast.AstIdentifier:
				varRef = this.variableRefFromAstIdent(astUnary);
				break;
			case Ast.AstConstant:
				varRef = this.variableRefFromAstConstant(astUnary);
				break;
            case Ast.AstPrefixOp:
                operand = astUnary.astOperand;
				if (astUnary.astOperand.astType !== Ast.AstVariable) {
					operand = this.evalUnaryOperator(astUnary.astOperand);
				}
                if (astUnary.token === Token.TokenIncrement) {
                    varRef = this.evalPrefixIncr(operand);
                } else {
                    varRef = this.evalPrefixDecr(operand);
                }
				break;
            case Ast.AstPostfixOp:
                operand = astUnary.astOperand;
				if (astUnary.astOperand.astType !== Ast.AstVariable) {
					operand = this.evalUnaryOperator(astUnary.astOperand);
				}
                if (astUnary.token === Token.TokenIncrement) {
                    varRef = this.evalPostfixIncr(operand);
                } else {
                    varRef = this.evalPostfixDecr(operand);
                }
				break;
			case Ast.AstTakeAddress:
                operand = astUnary.astOperand;
				if (astUnary.astOperand.astType !== Ast.AstVariable) {
					operand = this.evalUnaryOperator(astUnary.astOperand);
				}
				varRef = this.evalTakeAddress(operand);
				break;
			case Ast.AstTakeValue:
                operand = astUnary.astOperand;
				if (astUnary.astOperand.astType !== Ast.AstVariable) {
					operand = this.evalUnaryOperator(astUnary.astOperand);
				}
				varRef = this.evalTakeValue(operand);
				break;
			case Ast.AstUMinus:
                operand = astUnary.astOperand;
				if (astUnary.astOperand.astType !== Ast.AstVariable) {
					operand = this.evalUnaryOperator(astUnary.astOperand);
				}
				varRef = this.evalTakeUMinus(operand);
				break;
			case Ast.AstUnaryNot:
                operand = astUnary.astOperand;
				if (astUnary.astOperand.astType !== Ast.AstVariable) {
					operand = this.evalUnaryOperator(astUnary.astOperand);
				}
				varRef = this.evalTakeNot(operand);
				break;
			case Ast.AstUnaryExor:
                operand = astUnary.astOperand;
				if (astUnary.astOperand.astType !== Ast.AstVariable) {
					operand = this.evalUnaryOperator(astUnary.astOperand);
				}
				varRef = this.evalTakeExor(operand);
				break;
			default:
				break;
		}

		return varRef;
    } // end of evalUnaryOperator

    evalBinaryOperator(lhs, rhs, opToken) {
        let val1;
        let val2;
        let result;
        let baseType;
        let hasFP = false;

        if (!lhs.variable.isNumericType()) {
            platform.programFail(`left side of operation is NOT a valid number`);
        }
        if (lhs.variable.dataType.baseType === BaseType.TypeFP) {
            hasFP = true;
        }
        val1 = lhs.variable.getValue(lhs.variable.accessIndexes);

        if (!rhs.variable.isNumericType()) {
            platform.programFail(`right side of operation is NOT a valid number`);
        }
        if (rhs.variable.dataType.baseType === BaseType.TypeFP) {
            hasFP = true;
        }
        val2 = rhs.variable.getValue(rhs.variable.accessIndexes);

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
                result = val1 < val2 ? 1 : 0;
                baseType = BaseType.TypeInt;
                break;
            case Token.TokenLessEqual: // 小于等于
                result = val1 <= val2 ? 1 : 0;
                baseType = BaseType.TypeInt;
                break;
            case Token.TokenGreaterThan: // 大于
                result = val1 > val2 ? 1 : 0;
                baseType = BaseType.TypeInt;
                break;
            case Token.TokenGreaterEqual: // 大于等于
                result = val1 >= val2 ? 1 : 0;
                baseType = BaseType.TypeInt;
                break;
            case Token.TokenEqual: // 等于
                result = val1 === val2 ? 1 : 0;
                baseType = BaseType.TypeInt;
                break;
            case Token.TokenNotEqual: // 不等于
                result = val1 !== val2 ? 1 : 0;
                baseType = BaseType.TypeInt;
                break;
            case Token.TokenAmpersand: // 按位与
                if (hasFP) {
                    platform.programFail(`invalid operands to binary &`);
                }
                result = val1 & val2;
                baseType = BaseType.TypeInt;
                break;
            case Token.TokenArithmeticOr: // 按位或
                if (hasFP) {
                    platform.programFail(`invalid operands to binary |`);
                }
                result = val1 | val2;
                baseType = BaseType.TypeInt;
                break;
            case Token.TokenArithmeticExor: // 按位异或
                if (hasFP) {
                    platform.programFail(`invalid operands to binary ^`);
                }
                result = val1 ^ val2;
                baseType = BaseType.TypeInt;
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
            variable: variable,
            accessIndexes: []
        };
    } // end of evalBinaryOperator

    evalAssignOperator(astIdent, astExpression, assignToken) {
        assignToken = (assignToken === undefined ? Token.TokenAssign : assignToken);
        const lhs = this.evalUnaryOperator(astIdent);
        const rhs = this.evalExpression(astExpression);
        const rhsElem = rhs.variable.createElementVariable(rhs.accessIndexes);

        // 赋值操作变量必须是左值
        if (lhs.variable.name === null) {
            platform.programFail(`lvalue required`);
        }

        // 纯赋值操作单独处理
        if (assignToken === Token.TokenAssign) {
            lhs.variable.assign(lhs.accessIndexes, rhsElem);
            return {
                astType: Ast.AstVariable,
                variable: lhs.variable,
                accessIndexes: lhs.accessIndexes
            };
        }

        // 除了"="赋值以外，其他赋值类型，如"+=", ">>="等，要求右值必须为数值类型
        if (!rhsElem.isNumericType()) {
            platform.programFail(`right hand side of "${Token.getTokenName(assignToken)}"
                                    must be a numeric value`);
        }

        // 进一步检查数据类型
        switch (assignToken) {
            case Token.TokenModulusAssign:
            case Token.TokenShiftLeftAssign:
            case Token.TokenShiftRightAssign:
            case Token.TokenArithmeticAndAssign:
            case Token.TokenArithmeticOrAssign:
            case Token.TokenArithmeticExorAssign:
                if (!rhsElem.isIntegerType()) {
                    platform.programFail(`right hand side of "${Token.getTokenName(assignToken)}"
                                            must be an integer`);
                }
            case Token.TokenMultiplyAssign:
            case Token.TokenDivideAssign:
                if (lhs.variable.isPtrType()) {
                    platform.programFail(`left hand side of "${Token.getTokenName(assignToken)}"
                                            must be numeric`);
                }

            default:
                assert(false, `internal: evalAssignOperator(): Unexpected assignToken ${assignToken}`);
                break;
        }

        switch (assignToken) {
            case Token.TokenAddAssign:
            case Token.TokenSubtractAssign:
                if (lhs.variable.isPtrType()) {
                    lhs.variable.handlePtrChange(lhs.accessIndexes, n, assignToken);
                    break;
                }
            case Token.TokenMultiplyAssign:
            case Token.TokenDivideAssign:
            case Token.TokenModulusAssign:
            case Token.TokenShiftLeftAssign:
            case Token.TokenShiftRightAssign:
            case Token.TokenArithmeticAndAssign:
            case Token.TokenArithmeticOrAssign:
            case Token.TokenArithmeticExorAssign:
                const n = rhsElem.getValue();
                lhs.variable.setValue(lhs.accessIndexes, n, assignToken);
                break;
            default:
                assert(false, `internal: evalAssignOperator(): Unexpected assignToken ${assignToken}`);
                break;
        }

        return {
            astType: Ast.AstVariable,
            variable: lhs.variable,
            accessIndexes: lhs.accessIndexes
        };
    } // end of evalAssignOperator

    evalBlock(astBlock) {
        this.scopes.pushScope(Ast.AstBlock);
        for (let statement of astBlock.statements) {
            this.evalDispatch(statement);

            // 判断执行的语句是否为continue, break, return
            if (__controlStatus === ControlStatus.CONTINUE) {
                break;
            }
            if (__controlStatus === ControlStatus.BREAK) {
                break;
            }
            if (__controlStatus === ControlStatus.RETURN) {
                return ;
            }
        }
        this.scopes.popScope();
    }

    evalBody(astBody) {
        // 处理空语句体
        if (astBody === null) {
            return ;
        }

        this.evalDispatch(astBody);

        /*
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
        */

        return ;
    }

    evalIf(astIf) {
        const condition = this.evalExpressionBoolean(astIf.conditional);

        if (condition) {
            this.evalBody(astIf.ifBranch);
        } else if (astIf.elseBranch !== null){
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
        this.scopes.pushScope(Ast.AstFor);
        if (astFor.initial !== null) {
            this.evalDispatch(astFor.initial);
        }

        while(this.evalExpressionBoolean(astFor.conditional)) {
            this.evalBody(astFor.body);
            if (__controlStatus === ControlStatus.CONTINUE) {
                // 在循环中终结continue
                __controlStatus = null;
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

        this.scopes.popScope();
    }

    evalSwitch(astSwitch) {
        let matched = false;
        let isDefault = true;
        const value = this.evalExpression(astSwitch.value);

        switchStatement: // a label
        for (let v of astSwitch.cases) {
            if (!matched) {
                let caseValue = this.evalExpression(v.expression);
                matched = this.evalBinaryOperator(value, caseValue, Token.TokenEqual).variable.getValue();
            }
            if (matched) {
                isDefault = false;
                for (let statement of v.block.statements) {
                    this.evalDispatch(statement);
                    if (__controlStatus === ControlStatus.CONTINUE) {
                        break switchStatement; // jump to the label
                    }
                    if (__controlStatus === ControlStatus.BREAK) {
                        // 在switch中终结break
                        __controlStatus = null;
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
                if (__controlStatus === ControlStatus.CONTINUE) {
                    break;
                }
                if (__controlStatus === ControlStatus.BREAK) {
                    // 在switch中终结break
                    __controlStatus = null;
                    break;
                }
                if (__controlStatus === ControlStatus.RETURN) {
                    return ;
                }
            }
        }
    }

    /* parser.js:
    // 参数的AST
    const astParam = {
        astType: Ast.AstParam,
        paramType: astParamType,
        ident: null,
        arrayIndexes: []
    };
    const astFuncDef = {
        astType: Ast.AstFuncDef,
        name: null,
        params: [],
        body: null,
        returnType: returnType
    };
    */
    evalFuncDef(astFuncDef) {
        // 函数定义只允许出现在全局命名空间
        if (!this.scopes.isInGlobalScope()) {
            platform.programFail(`function definition is only allowed in global scope`);
        }

        // 检查是否有重名的函数/变量存在
        if (this.scopes.findGlobalIdent(astFuncDef.name) !== null) {
            platform.programFail(`redeclaration of ${astFuncDef.name}`);
        }

        // 评估返回类型
        const returnType = Variable.createDataType(astFuncDef.returnType.astBaseType,
                                               astFuncDef.returnType.numPtrs,
                                               astFuncDef.returnType.ident);
        astFuncDef.returnType = returnType;

        // evaluate parameters
        const varParams = [];
        let paramType;
        let paramIndexes;
        let paramVariable;
        for (let param of astFuncDef.params) {
            paramType = Variable.createDataType(param.paramType.astBaseType,
                                               param.paramType.numPtrs,
                                               param.paramType.ident);
            paramIndexes = [];
            for (let idxExpression of param.arrayIndexes) {
                paramIndexes.push(this.evalExpressionInt(idxExpression));
            }
            paramType.arrayIndexes = paramIndexes;

            // 创建形参变量
            paramVariable = new Variable(paramType, param.ident, null);
            paramVariable.initDefaultValue();

            varParams.push(paramVariable);
        }

        astFuncDef.params = varParams;

        // 加入全局scope
        this.scopes.addIdent(astFuncDef.name, astFuncDef);
        return ;
    } // end of evalFuncDef()

    /* parser.js:
    const astFuncCall = {
        astType: Ast.AstFuncCall,
        name: funcName,
        args: args // expression
    };
    const astExpression = {
        astType: Ast.AstExpression,
        elementList: elementList,
        next: astNextExpression
    };
    */
    evalFuncCall(astFuncCall) {
        // 检查函数是否已经定义
        const astFuncDef = this.scopes.findGlobalIdent(astFuncCall.name);
        if (astFuncDef === null) {
            platform.programFail(`function ${astFuncCall.name} is NOT defined`);
        }
        if (astFuncDef.body === null) {
            // 函数只声明了，但是没定义
            platform.programFail(`function ${astFuncCall.name} declared but NOT defined`);
        }

        // 比较函数形参和实参数目，必须一致
        // todo: 变参函数
        if (astFuncDef.params.length > astFuncCall.args.length) {
            platform.programFail(`too few arguments to function '${astFuncCall.name}'`);
        } else if (astFuncDef.params.length < astFuncCall.args.length) {
            platform.programFail(`too many arguments to function '${astFuncCall.name}'`);
        }

        // evaluate arguments
        const varArgs = [];
        let astArgExpression = astFuncCall.args;
        let astArgNext;
        let varResult;
        while (astArgExpression !== null) {
            astArgNext = astArgExpression.next;
            astArgExpression.next = null;

            varResult = this.evalExpression(astArgExpression);
            varArgs.push(varResult);

            astArgExpression = astArgNext;
        }

        // 创建新的scope(调用栈)
        this.scopes.pushScope(Ast.AstFuncCall);

        // 用实参替换形参
        let varParam;
        let varArg;
        for (let i = 0; i < varArgs.length; i ++) {
            varParam = astFuncDef.params[i];
            varArg = astFuncCall.args[i];

            // 检查形参是否为数组
            // 注意：这里要单独处理，因为通常情况下不能对数组进行赋值
            if (varParam.dataType.arrayIndexes.length !== 0) {
                if (varParam.dataType.arrayIndexes.length !== varArg.dataType.arrayIndexes.length) {
                    platform.programFail(`argument ${i} has different dimension as corresponding parameter`);
                }
                for (let dim = 0; dim < varParam.dataType.arrayIndexes.length; dim ++) {
                    if (dim == 0 && varParam.dataType.arrayIndexes[dim] === 0) {
                        continue;
                    }
                    if (varParam.dataType.arrayIndexes[dim] !== varArg.dataType.arrayIndexes[dim]) {
                        platform.programFail(`argument ${i} has different array definition as corresponding parameter`);
                    }
                }

                const varAlias = varArg.createAlias(varParam.name);
                this.scopes.addIdent(varAlias.name, varAlias);
            } else {
                varParam.assign([], varArg);
                this.scopes.addIdent(varParam.name, varParam);
            }

        }

        // 执行函数体
        this.evalBody(astFuncDef.body);

        // 查看返回值
        let retValue = new Variable(astFuncDef.returnType, null, null);
        if (__controlStatus === ControlStatus.RETURN) {
            retValue.assign([], __returnValue);
            __returnValue = null;
            __controlStatus = null; // RETURN在这里终结
        }

        // 弹出调用栈
        this.scopes.popScope();

        return retValue;
    }

    evalComposite(astComposite) {
        for (let astNode of astComposite.astList) {
            this.evalDispatch(astNode);
        }
    }

    // 根据AST类型进行分发处理
    evalDispatch(astNode) {
        switch (astNode.astType) {
            case Ast.AstComposite:
                this.evalComposite(astNode);
                break;
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
                __returnValue = this.evalExpressionRHS(astNode.value);
                __controlStatus = ControlStatus.RETURN;
                //platform.programFail(`return statement not within a function`);
                break;

            case Ast.AstFuncDef:
                this.evalFuncDef(astNode);
                break;
            case Ast.AstFuncCall:
                this.evalFuncCall(astNode);
                break;

            default:
                break;
        }

        return ;
    }


}

const parser = new Parser('./test.c');
const evaluator = new Evaluator();

let res;
while ((res = parser.parseStatement()) !== null) {
    debug.debugShow(res);
    evaluator.evalDispatch(res); 
}

debug.dumpScopes(evaluator.scopes);
