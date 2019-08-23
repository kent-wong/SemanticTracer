const assert = require('assert');
const Token = require('./interpreter');
const BaseType = require('./basetype');
const ValueType = require('./valuetype');
const Scopes = require('./scopes');
const platform = require('./platform');
const Ast = require('./ast');

class Evaluator {
    constructor() {
        this.scopes = new Scopes();
    }

    createDataType(baseType, numPtrs, customType) {
        numPtrs = (numPtrs === undefined ? 0 : numPtrs);
        customType = (customType === undefined ? null : customType);

        return {
            baseType: baseType,
            numPtrs: numPtrs,
            arrayIndexes: [],
            customType: customType
        };
    }

    // 创建一个变量
    createVariable(dataType, ident, value) {
        if (value === undefined) {
            value = this.evalDefaultTypeValue(dataType);
        }

        const variable = {
            dataType: dataType,
            ident: ident,
            value: value,
            refTo: null,

            getValue(indexes) {
                if (indexes === undefined) {
                    indexes = [];
                }

                if (indexes.length !== this.dataType.arrayIndexes.length) {
                    return null;
                }

                let v = this.value;
                for (let i = 0; i < indexes.length; i ++) {
                    if (indexes[i] >= this.dataType.arrayIndexes[i]) {
                        platform.programFail(`array index ${indexes[i]} out of bound`);
                    }
                    v = v[indexes[i]];
                }
                return v;
            },
            setValue(value, indexes, isIncr) {
                if (isIncr === undefined) {
                    isIncr = false;
                }

                if (indexes.length !== this.dataType.arrayIndexes.length) {
                    return null;
                }

                if (indexes.length === 0) {
                    if (isIncr) {
                        this.value += value;
                    } else {
                        this.value = value;
                    }

                    return;
                }

                let v = this.value;
                for (let i = 0; i < indexes.length - 1; i ++) {
                    if (indexes[i] >= this.dataType.arrayIndexes[i]) {
                        platform.programFail(`array index ${indexes[i]} out of bound`);
                    }
                    v = v[indexes[i]];
                }

                if (indexes[-1] >= this.dataType.arrayIndexes[-1]) {
                    platform.programFail(`array index ${indexes[-1]} out of bound`);
                }

                if (isIncr) {
                    v[indexes[-1]] += value;
                } else {
                    v[indexes[-1]] = value;
                }

                return;
            },
            setValueIncr(value, indexes) {
                setValue(value, indexes, true);
            },
            copyElement(indexes) {
                const tempType = this.createDataType(this.dataType.basetype);
                const tempValue = variable.getValue(indexes);
                const tempVariable = this.createVariable(tempType, null, tempValue);

                return tempVariable;
            }
        };

        return variable;
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

        return this.createVariable(dataType, astDecl.ident, evalRHS);
    }

    // 处理自增/自减运算
    evalSelfOp(astIdent, isPostfix, isIncr) {
        assert(astIdent.astType === Ast.AstPostfixOp,
                    `internal error: evalPostfixOp(): param is NOT AstPostfixOp`);
        assert(astIdent.token === Token.TokenIncrement || astIdent.token === Token.TokenDecrement,
                    `internal error: evalPostfixOp(): param operator token ${astIdent.token} is invalid`);

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

        this.assertCompatibleArrayIndexes(variable, astIdent);
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
            const tempVariable = this.copyElement(astIdent.arrayIndexes);
            this.setValueIncr(delta, astIdent.arrayIndexes);
        } else {
            this.setValueIncr(delta, astIdent.arrayIndexes);
            const tempVariable = this.copyElement(astIdent.arrayIndexes);
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

    // 检查变量引用中使用的数组下标是否合法
    assertCompatibleArrayIndexes(variable, astIdent) {
        if (astIdent.arrayIndexes.length === 0) {
            return;
        }

        // 检查数组维度的一致性
        if (variable.arrayIndexes.length !== astIdent.arrayIndexes.length) {
            if (variable.arrayIndexes.length === 0) {
                platform.programFail(`${variable.ident} is not an array`);
            } else {
                platform.programFail(`unmatched indexes`);
            }
        }

        for (let i = 0; i < variable.arrayIndexes.length; i ++) {
            if (variable.arrayIndexes[i] <= astIdent.arrayIndexes[i]) {
                platform.programFail(`array index ${astIdent.arrayIndexes[i]} overflowed`);
            }
        }
    }

    evalExpression() {
    }

    evalExpressionInt() {
    }
}
