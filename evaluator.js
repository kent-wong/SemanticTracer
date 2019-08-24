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

    evalVariableFromAstIdent(astIdent) {
        const variable = this.evalGetVariable(astIdent.ident);
        if (variable === null) {
            platform.programFail(`${astIdent.ident} undeclared`);
        }
        return variable.createElementVariable(astIdent.accessIndexes);
    }

    // 将表达式列表中的元素进行计算和转换，然后依次入栈
    evalExpressionPushStack(elementList) {
        if (elementList.length === 0) {
            return null;
        }

        const stack = [];
        let token;
        let v;
        for (let astElement of elementList) {
            if (astElement.astType === Ast.AstIdentifier) {
                v = this.evalVariableFromAstIdent(astElement);
                token = Token.TokenIdentifier;
            } else if (astElement.astType === Ast.AstTakeAddress) {
                v = this.evalTakeAddress(astElement);
                token = Token.TokenIdentifier;
            } else if (astElement.astType === Ast.AstTakeValue) {
                v = this.evalTakeValue(astElement);
                token = Token.TokenIdentifier;
            } else if (astElement.astType === Ast.AstUMinus) {
                v = this.evalTakeUMinus(astElement);
                token = Token.TokenIdentifier;
            } else if (astElement.astType === Ast.AstUnaryNot) {
                v = this.evalTakeNot(astElement);
                token = Token.TokenIdentifier;
            } else if (astElement.astType === Ast.AstOperator) {
                switch (astElement.token) {
                    case TokenQuestionMark:
                        break;
                    case TokenColon:
                        break;

                    case TokenLogicalOr:
                        break;
                    case TokenLogicalAnd:
                        break;
                    case TokenArithmeticOr:
                        break;
                    case TokenArithmeticExor:
                        break;

                    case TokenEqual:
                        break;
                    case TokenNotEqual:
                        break;
                    case TokenLessThan:
                        break;
                    case TokenGreaterThan:
                        break;
                    case TokenLessEqual:
                        break;
                    case TokenGreaterEqual:
                        break;

                    case TokenShiftLeft:
                        break;
                    case TokenShiftRight:
                        break;

                    case TokenPlus:
                        break;
                    case TokenMinus:
                        break;
                    case TokenAsterisk:
                        break;
                    case TokenSlash:
                        break;
                    case TokenModulus:
                        break;

                    case TokenUnaryExor:
                        break;
                    case TokenSizeof:
                        break;
                    case TokenCast:
                        break;
                    default:
                        break;
                }
            } else if (astElement.astType === Ast.AstConstant) {
                switch (astElement.token) {
                    case TokenIntegerConstant:
                        break;
                    case TokenFPConstant:
                        break;
                    case TokenStringConstant:
                        break;
                    case TokenCharacterConstant:
                        break;
                    default:
                        break;
                }
            } else if (astElement.astType === Ast.AstExpression) {
                // 子expression
            } else {
                assert(false, `Unrecognized expression element type ${astElement.astType}`);
            }

            stack.push(v);
        }

        return stack;
    }


}
