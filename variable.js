const Token = require('./interpreter');
const BaseType = require('./basetype');
const platform = require('./platform');

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

    // 赋值
    // 注意：此函数不对赋值操作合法性进行检查，调用者需要保证操作的合法性
    setValue(indexes, value, opToken) {
        if (opToken === undefined) {
            opToken = Token.TokenAssign;
        }

        this.checkAccessIndexes(indexes);

        // 变量不是数组，直接对其值进行操作
        if (this.dataType.arrayIndexes.length === 0) {
            switch (opToken) {
                case Token.TokenAssign:
                    this.value = value;
                    break;
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
                case Token.TokenAddAssign:
                    this.value += value;
                    break;
                case Token.TokenDecrement:
                case Token.TokenSubtractAssign:
                    this.value -= value;
                    break;
                case Token.TokenMultiplyAssign:
                    this.value *= value;
                    break;
                case Token.TokenDivideAssign:
                    this.value /= value;
                    break;
                case Token.TokenModulusAssign:
                    this.value %= value;
                    break;
                case Token.TokenShiftLeftAssign:
                    this.value <<= value;
                    break;
                case Token.TokenShiftRightAssign:
                    this.value >>= value;
                    break;
                case Token.TokenArithmeticAndAssign:
                    this.value &= value;
                    break;
                case Token.TokenArithmeticOrAssign:
                    this.value |= value;
                    break;
                case Token.TokenArithmeticExorAssign:
                    this.value ^= value;
                    break;
                default:
                    assert(false, `Unrecognized operator token ${opToken}`);
                    break;
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

        switch (opToken) {
            case Token.TokenAssign:
                v[indexes[-1]] = value;
                break;
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
            case Token.TokenAddAssign:
                v[indexes[-1]] += value;
                break;
            case Token.TokenDecrement:
            case Token.TokenSubtractAssign:
                v[indexes[-1]] -= value;
                break;
            case Token.TokenMultiplyAssign:
                v[indexes[-1]] *= value;
                break;
            case Token.TokenDivideAssign:
                v[indexes[-1]] /= value;
                break;
            case Token.TokenModulusAssign:
                v[indexes[-1]] %= value;
                break;
            case Token.TokenShiftLeftAssign:
                v[indexes[-1]] <<= value;
                break;
            case Token.TokenShiftRightAssign:
                v[indexes[-1]] >>= value;
                break;
            case Token.TokenArithmeticAndAssign:
                v[indexes[-1]] &= value;
                break;
            case Token.TokenArithmeticOrAssign:
                v[indexes[-1]] |= value;
                break;
            case Token.TokenArithmeticExorAssign:
                v[indexes[-1]] ^= value;
                break;
            default:
                assert(false, `Unrecognized operator token ${opToken}`);
                break;
        }

        return;
    }

    setValueIncr(indexes, value) {
        this.setValue(indexes, value, Token.TokenIncrement);
    }

    setValueDecr(indexes, value) {
        this.setValue(indexes, value, Token.TokenDecrement);
    }

    setValueMinus(indexes, value) {
        this.setValue(indexes, value, Token.TokenMinus);
    }

    setValueNot(indexes, value) {
        this.setValue(indexes, value, Token.TokenUnaryNot);
    }

    setValueExor(indexes, value) {
        this.setValue(indexes, value, Token.TokenUnaryExor);
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

    isPtrType() {
        return this.dataType.numPtrs !== 0;
    }

    isArrayType() {
        return this.dataType.arrayIndexes.length !== 0;
    }

    isNumericType() {
        if (this.dataType.customType !== null) {
            // todo: 如果是typedef int sometype; 那么应该返回true
            return false;
        }

        if (this.isArrayType() || this.isPtrType()) {
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

    assignToPtr(indexes, rhs) {
        if (rhs === null) {
            this.setValue(indexes, null);
        }

        let targetPtrs = rhs.dataType.numPtrs;
        if (rhs.isArrayType()) {
            targetPtrs ++;
        }

        if (this.dataType.baseType !== rhs.dataType.baseType ||
              this.dataType.numPtrs !== targetPtrs) {
            platform.programFail(`incompatible pointer type`);
        }

        // for array type variable, a pointer referrences its first element
        if (rhs.isArrayType()) {
            const accessIndexes = [];
            accessIndexes.length = rhs.dataType.arrayIndexes;
            accessIndexes.fill(0);

            this.setValue({refTo: rhs, indexes: accessIndexes});
        } else {
            let value = rhs.getValue();
            this.setValue(indexes, value);
        }

        return this.createElementVariable(indexes);
    } // end of assignToPtr

    handlePtrChange(indexes, n, opToken) {
        const refValue = this.getValue(indexes);
    }

    assignConstant(indexes, n) {
        if (!this.isNumericType()) {
            platform.programFail(`Incompatible types`);
        }

        let result = n;
        switch(this.dataType.baseType) {
            case BaseType.TypeInt:
                if (n < 0) {
                    result = 0x80000000 - (n & 0x7FFFFFFF);
                    result *= -1;
                } else {
                    result = n & 0x7FFFFFFF;
                }
                break;
            case BaseType.TypeShort:
                if (n < 0) {
                    result = 0x8000- (n & 0x7FFF);
                    result *= -1;
                } else {
                    result = n & 0x7FFF;
                }
                break;
            case BaseType.TypeChar:
                if (n < 0) {
                    result = 0x80- (n & 0x7F);
                    result *= -1;
                } else {
                    result = n & 0x7F;
                }
                break;
            case BaseType.TypeLong:
                if (n < 0) {
                    result = 0x80000000 - (n & 0x7FFFFFFF);
                    result *= -1;
                } else {
                    result = n & 0x7FFFFFFF;
                }
                break;
            case BaseType.TypeUnsignedInt:
                result = n & 0xFFFFFFFF;
                break;
            case BaseType.TypeUnsignedShort:
                result = n & 0xFFFF;
                break;
            case BaseType.TypeUnsignedChar:
                result = n & 0xFF;
                break;
            case BaseType.TypeUnsignedLong:
                result = n & 0xFFFFFFFF;
                break;
            case BaseType.TypeFP:
                break;
            default:
                assert(false, `internal error: assignConstant(): 
                               wrong baesType: ${this.dataType.baseType}`);
                break;
        }

        this.setValue(indexes, result);
        return this.createElementVariable(indexes);
    } // end of assignConstant

    assign(indexes, rhs) {
        if (rhs === null) {
            return this.assignToPtr(indexes, rhs);
        } else if (rhs.isNumericType()) {
            const n = rhs.getValue(indexes);
            return this.assignConstant(indexes, n);
        }

        // rhs is an array
        if (rhs.isArrayType()) {
            if (this.isPtrType()) {
                return this.assignToPtr(indexes, rhs);
            }

            platform.programFail(`Can Not assign an array to ${this.getTypeName()}`);
        }

        if (this.isPtrType()) {
            return this.assignToPtr(indexes, rhs);
        } else if (rhs.isPtrType()) {
            platform.programFail(`Can Not assign a pointer to ${this.getTypeName()}`);
        }

        // todo
        assert(false, `assignVariable(${indexes})`);
    }

    static createNumericVariable(baseType, name, value) {
        const dataType = {
            baseType: baseType,
            numPtrs: 0,
            arrayIndexes: []
        };

        return new Variable(dataType, name, value);
    }




}

module.exports = Variable;
