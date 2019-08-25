const Token = require('./interpreter');
const BaseType = require('./basetype');
const platform = require('./platform');
const Ast = require('./ast');

class Variable {
    constructor(dataType, name, values) {
        this.dataType = dataType
        this.name = name;
        this.values = values;
    }

    checkAccessIndexes(indexes) {
        if (indexes === undefined) {
            indexes = [];
        }

        if (this.dataType.arrayIndexes.length !== indexes.length) {
            if (this.dataType.arrayIndexes.length === 0) {
                platform.programFail(`${this.name} is not an array`);
            } else if (indexes.length === 0 ) {
                platform.programFail(`must specify indexes to access array elements`);
            } else {
                platform.programFail(`unmatched index dimension`);
            }
        }

        for (let i = 0; i < indexes.length; i ++) {
            if (indexes[i] >= this.dataType.arrayIndexes[i]) {
                platform.programFail(`array index ${indexes[i]} out of bound`);
            }
        }
    }

    // 获取变量的值/元素值
    getValue(indexes) {
        if (indexes === undefined) {
            indexes = [];
        }

        if (indexes.length !== this.dataType.arrayIndexes.length) {
            platform.programFail(`unmatched index dimension`);
        }

        let v = this.values;
        for (let i = 0; i < indexes.length; i ++) {
            if (indexes[i] >= this.dataType.arrayIndexes[i]) {
                platform.programFail(`array index ${indexes[i]} out of bound`);
            }
            v = v[indexes[i]];
        }
        return v;
    }

    setValue(value, indexes, opToken) {
        if (indexes === undefined) {
            indexes = [];
        }

        this.checkAccessIndexes(indexes);

        // 变量不是数组，直接对其值进行操作
        if (this.dataType.arrayIndexes.length === 0) {
            if (opToken === undefined) {
                this.value = value;
            } else {
                switch (opToken) {
                    case Token.TokenMinus:
                        this.value = -this.value;
                        break;
                    case Token.TokenUnaryNot:
                        this.value = !this.value;
                        break;
                    case Token.TokenUnaryExor:
                        this.value = ~this.value;
                        break;
                    case Token.TokenIncrement:
                        this.value += value;
                        break;
                    case Token.TokenDecrement:
                        this.value -= value;
                        break;
                    default:
                        assert(false, `Unrecognized operator token ${opToken}`);
                        break;
                }
            }
            return;
        }

        let v = this.values;
        for (let i = 0; i < indexes.length - 1; i ++) {
            if (indexes[i] >= this.dataType.arrayIndexes[i]) {
                platform.programFail(`array index ${indexes[i]} out of bound`);
            }
            v = v[indexes[i]];
        }

        if (indexes[-1] >= this.dataType.arrayIndexes[-1]) {
            platform.programFail(`array index ${indexes[-1]} out of bound`);
        }

        if (opToken === undefined) {
            v[indexes[-1]] = value;
        } else {
            switch (opToken) {
                case Token.TokenMinus:
                    v[indexes[-1]] = -this.value;
                    break;
                case Token.TokenUnaryNot:
                    v[indexes[-1]] = !this.value;
                    break;
                case Token.TokenUnaryExor:
                    v[indexes[-1]] = ~this.value;
                    break;
                case Token.TokenIncrement:
                    v[indexes[-1]] += value;
                    break;
                case Token.TokenDecrement:
                    v[indexes[-1]] -= value;
                    break;
                default:
                    assert(false, `Unrecognized operator token ${opToken}`);
                    break;
            }
        }

        return;
    }

    setValueIncr(value, indexes) {
        this.setValue(value, indexes, Token.TokenIncrement);
    }

    setValueDecr(value, indexes) {
        this.setValue(value, indexes, Token.TokenDecrement);
    }

    setValueMinus(value, indexes) {
        this.setValue(value, indexes, Token.TokenMinus);
    }

    setValueNot(value, indexes) {
        this.setValue(value, indexes, Token.TokenUnaryNot);
    }

    setValueExor(value, indexes) {
        this.setValue(value, indexes, Token.TokenUnaryExor);
    }

    // 创建一个variable，以指定的元素为其内容
    createElementVariable(indexes) {
        if (indexes === undefined) {
            indexes = [];
        }

        const theType = {
            baseType: this.dataType.baseType,
            numPtrs: this.dataType.numPtrs,
            arrayIndexes: [],
            customType: this.dataType.customType
        };

        const theValue = this.getValue(indexes);
        const theVariable = new Variable(theType, null, theValue);

        return theVariable;
    }

    // 创建一个指针variable，以指定的元素为其引用
    createElementRefVariable(indexes) {
        if (indexes === undefined) {
            indexes = [];
        }

        this.checkAccessIndexes(indexes);

        const theType = {
            baseType: this.dataType.baseType,
            numPtrs: this.dataType.numPtrs + 1, // 增加一层指针
            arrayIndexes: [],
            customType: this.dataType.customType
        };

        const theValue = {
            refTo: this,
            indexes: indexes
        };
        const theVariable = new Variable(theType, null, theValue);

        return theVariable;
    }

    isNumericType() {
        if (this.dataType.customType !== null) {
            // todo: 如果是typedef int sometype; 那么应该返回true
            return false;
        }

        switch (this.dataType.basetype) {
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

    getNumericValue() {
        if (!this.isNumericType()) {
            return null;
        }

        if (this.dataType.numPtrs !== 0 || this.dataType.arrayIndexes.length !== 0) {
            return null;
        }

        return this.values;
    }

    static createNumericVariable(baseType, name, value) {
        const dataType = {
            baseType: baseType,
            numPtrs: 0,
            arrayIndexes: []
        };

        return new Variable(dataType, name, value);
    }

    static evalBinaryOperator(lhs, rhs, opToken) {
        let val1;
        let val2;
        let result;
        let baseType;
        let hasFP = false;

        if (lhs.astType === Ast.AstIdentifier) {
            val1 = lhs.value.getNumericValue();
            if (val1 === null) {
                platform.programFail(`left side of multiplication is NOT a valid number`);
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

        if (rhs.astType === Ast.AstIdentifier) {
            val2 = rhs.value.getNumericValue();
            if (val2 === null) {
                platform.programFail(`right side of multiplication is NOT a valid number`);
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
            case Token.TokenAsterisk:
                result = val1 * val2;
                baseType = hasFP ? BaseType.TypeFP : BaseType.TypeUnsignedLong;
                break;
        }

        return Variable.createNumericVariable(baseType, null, result);
    }
}

module.exports = Variable;
