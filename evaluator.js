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

    evalDeclaration(astDecl) {
        assert(astDecl.astType === Ast.AstDeclaration,
                    `internal error: evalDeclaration(): param is NOT AstDeclaration`);
        assert(astDecl.ident !== null,
                    `internal error: evalDeclaration(): param has null ident`);

        const dataType = this.createDataType(astDecl.dataType.astBaseType,
                                                astDecl.dataType.numPtrs,
                                                astDecl.dataType.ident);
        const evalDecl = {
            dataType: dataType,
            ident: astDecl.ident,
            value: null,
            getValue(...indexes) {
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
            }
        };

        for (let idx of astDecl.arrayIndexes) {
            dataType.arrayIndexes.push(this.evalExpressionInt(idx));
        }

        let evalRHS;
        if (astDecl.rhs !== null) {
            evalRHS = this.evalExpression(astDecl.rhs);
            if (!this.checkTypeValueCompatible(dataType, evalRHS)) {
                platform.programFail(`incompatible value`);
            }
        } else {
            evalRHS = this.evalDefaultTypeValue(dataType);
        }

        evalDecl.value = evalRHS;

        return evalDecl;
    }

    // 处理后自增运算符
    evalPostfixOp(ast) {
        assert(ast.astType === Ast.AstPostfixOp,
                    `internal error: evalPostfixOp(): param is NOT AstPostfixOp`);
        assert(ast.token === Token.TokenIncrement || ast.token === Token.TokenDecrement,
                    `internal error: evalPostfixOp(): param operator token ${ast.token} is invalid`);

        // 通过AST获取变量，此变量必须存在于当前有效的scopes中
        const variable = this.evalGetVariable(ast.ident);

        // 检查++/--操作能否在此variable或其元素上进行
        const ok = this.checkSelfOpCompatible(variable.dataType);
        if (!ok) {
            if (ast.token === Token.TokenIncrement) {
                platform.programFail(`wrong type argument to increment`);
            } else {
                platform.programFail(`wrong type argument to decrement`);
            }
        }

        const temp = this.createDataType(variable.basetype);
        temp.value = variable.getValue(ast.ident.arrayIndexes);

    }

    evalGetVariable(ast) {
    }

    evalExpression() {
    }

    evalExpressionInt() {
    }
}
