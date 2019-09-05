const Token = require('./interpreter');
const BaseType = require('./basetype');
const platform = require('./platform');
const utils = require('./utils');

class Variable {
    constructor(dataType, name, values) {
        if (values === undefined) {
            values = null;
        }

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
        if (this.isArrayType()) {
            this.checkAccessIndexes(indexes);
            const position = this.positionFromIndex(indexes);
            v = this.values[position];
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
        if (!this.isArrayType()) {
            switch (opToken) {
                case Token.TokenAssign:
                    this.values = value;
                    break;
                case Token.TokenMinus:
                    this.values = -this.value;
                    break;
                case Token.TokenUnaryNot:
                    this.values = !this.value;
                    break;
                case Token.TokenUnaryExor:
                    this.values = ~this.value;
                    break;
                case Token.TokenIncrement:
                case Token.TokenAddAssign:
                    this.values += value;
                    break;
                case Token.TokenDecrement:
                case Token.TokenSubtractAssign:
                    this.values -= value;
                    break;
                case Token.TokenMultiplyAssign:
                    this.values *= value;
                    break;
                case Token.TokenDivideAssign:
                    this.values /= value;
                    break;
                case Token.TokenModulusAssign:
                    this.values %= value;
                    break;
                case Token.TokenShiftLeftAssign:
                    this.values <<= value;
                    break;
                case Token.TokenShiftRightAssign:
                    this.values >>= value;
                    break;
                case Token.TokenArithmeticAndAssign:
                    this.values &= value;
                    break;
                case Token.TokenArithmeticOrAssign:
                    this.values |= value;
                    break;
                case Token.TokenArithmeticExorAssign:
                    this.values ^= value;
                    break;
                default:
                    assert(false, `Unrecognized operator token ${opToken}`);
                    break;
            }
            return;
        }

        // 变量是数组
        const position = this.positionFromIndex(indexes);
        switch (opToken) {
            case Token.TokenAssign:
                this.values[position] = value;
                break;
            case Token.TokenMinus:
                this.values[position] = -this.value;
                break;
            case Token.TokenUnaryNot:
                this.values[position] = !this.value;
                break;
            case Token.TokenUnaryExor:
                this.values[position] = ~this.value;
                break;
            case Token.TokenIncrement:
            case Token.TokenAddAssign:
                this.values[position] += value;
                break;
            case Token.TokenDecrement:
            case Token.TokenSubtractAssign:
                this.values[position] -= value;
                break;
            case Token.TokenMultiplyAssign:
                this.values[position] *= value;
                break;
            case Token.TokenDivideAssign:
                this.values[position] /= value;
                break;
            case Token.TokenModulusAssign:
                this.values[position] %= value;
                break;
            case Token.TokenShiftLeftAssign:
                this.values[position] <<= value;
                break;
            case Token.TokenShiftRightAssign:
                this.values[position] >>= value;
                break;
            case Token.TokenArithmeticAndAssign:
                this.values[position] &= value;
                break;
            case Token.TokenArithmeticOrAssign:
                this.values[position] |= value;
                break;
            case Token.TokenArithmeticExorAssign:
                this.values[position] ^= value;
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

    static createDataType(baseType, numPtrs, customType) {
        numPtrs = (numPtrs === undefined ? 0 : numPtrs);
        customType = (customType === undefined ? null : customType);

        return {
            baseType: baseType,
            numPtrs: numPtrs,
            arrayIndexes: [],
            customType: customType
        };
    }

    // 创建一个variable，以指定的元素为其内容
    createElementVariable(indexes) {
        if (indexes === undefined) {
            indexes = [];
        }

        // 索引维度和变量维度相等，返回元素值
        if (indexes.length === this.dataType.arrayIndexes.length) {
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

        // 如果本变量是数组，并且指定的索引维度小于本数组维度，
        // 那么返回指针类型。计算原则如下：
        //      int *p;
        //      int array[2][3];
        //      p = array       --->  p = &array[0][0]
        //      p = array[0]    --->  p = &array[0][0]
        //      p = array[1]    --->  p = &array[1][0]
        if (indexes.length < this.dataType.arrayIndexes.length) {
            let delta = this.dataType.arrayIndexes.length - indexes.length;
            for (let i = 0; i < delta; i ++) {
                indexes.push(0);
            }
            return this.createElementPtrVariable(indexes);
        }

        // 指定的索引维度大于本变量的数组维度
        // 本变量(的元素)必须是指针，并且以指针为基础的索引必须是一维的
        let delta = indexes.length - this.dataType.arrayIndexes.length;
        if (!this.isPtrType() || delta !== 1) {
            platform.programFail(`subscripted value is neither array nor pointer`);
        }

        const truncatedIndexes = indexes.slice(0, this.dataType.arrayIndexes.length);
        const refValue = this.getValue(truncatedIndexes);
        if (refValue === 0) {
            platform.programFail(`referrence to null pointer`);
        }

        const newIndexes = this.ptrNewIndexes(refValue, indexes.pop());
        return refValue.refTo.createElementVariable(newIndexes);
    }

    // 创建一个指针variable，以指定的元素为其引用
    createElementPtrVariable(indexes) {
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

    // 创建别名，别名和原变量引用同样的数据
    // 别名主要用于在函数调用时用实参数组替换形参数组
    // 对于非数组变量，创建别名相当于clone
    createAlias(aliasName) {
        aliasName = (aliasName === undefined ? null : aliasName);

        const theType = {
            baseType: this.dataType.baseType,
            numPtrs: this.dataType.numPtrs,
            arrayIndexes: this.dataType.arrayIndexes,
            customType: this.dataType.customType
        };

        const theVariable = new Variable(theType, aliasName, this.values);

        return theVariable;
    } // end of createArrayPtrVariable()

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

        switch (this.dataType.baseType) {
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

    // 判断此变量的元素是否为数值类型
    isNumericElement() {
        if (this.isPtrType()) {
            return false;
        }

        switch (this.dataType.baseType) {
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

    initArrayValue(initValues) {
        for (let i = 0; i < initValues.length; i ++) {
            /*
            if (initValues[i] === null) {
                initValues[i] = this.createDefaultValueVariable();
            }
            */

            //this.values[i] = this.checkAndRetrieveAssignValue(initValues[i]);
            if (initValues[i] !== null) {
                const idx = this.indexFromPosition(i);
                this.assign(idx, initValues[i]);
            }
        }
        return;
    }

    initScalarValue(value) {
        return this.assign([], value);
    }

    initDefaultValue() {
        if (this.dataType.arrayIndexes.length !== 0) {
            const values = [];
            values.length = utils.factorial(...this.dataType.arrayIndexes);
            values.fill(0);
            this.values = values;
        } else {
            this.values = 0;
        }
    }

    assignToPtr(indexes, rhs) {
        if (rhs.isNumericType()) {
            const n = rhs.getValue();
            if (n !== 0) {
                platform.programFail(`Semantic error: it is *NOT* safe to assign a non-zero number to a pointer`);
            }
            this.setValue(indexes, 0);
            return this;
        }

        let targetPtrs = rhs.dataType.numPtrs;
        /*
        if (rhs.isArrayType()) {
            targetPtrs += rhs.dataType.arrayIndexes.length;
        }
        */

        if (this.dataType.baseType !== rhs.dataType.baseType ||
              this.dataType.numPtrs !== targetPtrs) {
            platform.programFail(`incompatible pointer type`);
        }

        /*
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
        */

        let value = rhs.getValue();
        this.setValue(indexes, value);
        return this;
        //return this.createElementVariable(indexes);
    } // end of assignToPtr

    totalElements() {
        if (this.dataType.arrayIndexes.length === 0) {
            return 1;
        }

        return utils.factorial(...this.dataType.arrayIndexes);
    }

    positionFromIndex(accessIndexes) {
        let position = 0;
        let multi;
        const expansionPoints = utils.expansionPoints(this.dataType.arrayIndexes); 
        expansionPoints.push(1);

        for (let i = 0; i < accessIndexes.length; i ++) {
            position += accessIndexes[i] * expansionPoints[i];
        }

        return position;
    }

    indexFromPosition(pos) {
        const indexes = [];
        const expansionPoints = utils.expansionPoints(this.dataType.arrayIndexes); 

        for (let e of expansionPoints) {
            indexes.push(pos/e);
            pos = pos % e;
        }
        indexes.push(pos);

        return indexes;
    }

    ptrNewIndexes(refValue, n) {
        if (!refValue || refValue.refTo.dataType.arrayIndexes.length === 0) {
            assert(false, `internal: ptrRefCalc(): invalid input parameter`);
        }

        // 计算出数组的全部元素数目
        const numTotalElements = refValue.refTo.totalElements();

        // 计算出指针当前指向的元素位置
        let newPosition = 0;
        let multi;
        const calcList = [];
        for (let i = 0; i < refValue.indexes.length; i ++) {
            multi = utils.factorial(...refValue.refTo.dataType.arrayIndexes.slice(i+1));
            calcList.push(multi);
            newPosition += refValue.indexes[i] * multi;
        }

        // 计算新位置
        newPosition += n;

        if (newPosition >= numTotalElements) {
            platform.programFail(`semantic error: increase pointer by ${n} will overflow the array boundary`);
        }
        if (newPosition < 0) {
            platform.programFail(`semantic error: decrease pointer by ${n} will underflow the array boundary`);
        }

        // 计算新的索引
        const newIndexes = refValue.indexes.slice();
        for (let i = 0; i < refValue.indexes.length; i ++) {
            newIndexes[i] = newPosition / calcList[i];
            newPosition %= calcList[i];
        }

        return newIndexes;
    }

    handlePtrChange(indexes, n, opToken) {
        if (n === 0) {
            return this;
        }

        const refValue = this.getValue(indexes);
        if (refValue === null || refValue === 0) {
            // 指针为null，不允许给指针指定非0值
            platform.programFail(`can NOT assign numeric value to pointer except NULL(0)`);
        }

        // 如果指针指向的目标不是数组，不允许改变指针的值
        if (refValue.refTo.dataType.arrayIndexes.length === 0) {
            platform.programFail(`semantic error: attempts redirecting pointer to point to unknown place`);
        }

        let newIndexes;
        switch (opToken) {
            case Token.TokenAddAssign:
            case Token.TokenIncrement:
                refValue.indexes = this.ptrNewIndexes(refValue, n);
                break;
            case Token.TokenSubtractAssign:
            case Token.TokenDecrement:
                refValue.indexes = this.ptrNewIndexes(refValue, -n);
                break;
            default:
                assert(false, `internal: handlePtrChange(): unexpected operator token ${opToken}`);
                break;
        }


        return this;
        //return this.createElementVariable(indexes);
    } // end of handlePtrChange

    assignNumeric(indexes, rhs) {
        if (!this.isNumericElement()) {
            platform.programFail(`Incompatible types`);
        }

        const n = rhs.getValue();
        let result = Variable.convertNumericValue(this.dataType.baseType, n);
        this.setValue(indexes, result);
        return this.createElementVariable(indexes);
    } // end of assignNumeric

    assign(indexes, rhs) {
        if (this.isPtrType()) {
            // 对指针赋值
            return this.assignToPtr(indexes, rhs);
        } else {
            if (rhs.isPtrType()) {
                platform.programFail(`Can Not assign a pointer to ${BaseType.getTypeName(this.dataType.baseType)}`);
            }
            
            if (rhs.isArrayType()) {
                platform.programFail(`Can Not assign an array to ${BaseType.getTypeName(this.dataType.baseType)}`);
            }

            if (rhs.isNumericType()) {
                return this.assignNumeric(indexes, rhs);
            }

        }

        // todo
        assert(false, `assign(${indexes})`);
    } // end of assign

    createDataType(baseType, numPtrs, customType, arrayIndexes) {
        if (numPtrs === undefined) {
            numPtrs = 0;
        }
        if (customType === undefined) {
            customType = null;
        }
        if (arrayIndexes === undefined) {
            arrayIndexes = [];
        }

        return {
            baseType: baseType,
            numPtrs: numPtrs,
            arrayIndexes: arrayIndexes,
            customType: customType
        };
    }

    static createNumericVariable(baseType, name, value) {
        const dataType = Variable.createDataType(baseType);
        return new Variable(dataType, name, value);
    }

    static isSameType(type1, type2) {
        return type1.baseType === type2.baseType &&
                 type1.numPtrs === type2.numPtrs &&
                 type1.customType === type2.customType &&
                 utils.isEqualArray(type1.arrayIndexes, type2.arrayIndexes);
    }


    static convertNumericValue(baseType, n) {
        let result = n;

        switch(baseType) {
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
                platform.programFail(`unexpected baseType ${baseType}`);
        }

        return result;
    }

}

module.exports = Variable;
