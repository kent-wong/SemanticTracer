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

        variable.checkAccessIndexes(astIdent.accessIndexes);

        // 变量或变量元素的类型必须是指针
    }


    evalExpression() {
    }

    evalExpressionInt() {
    }
}
