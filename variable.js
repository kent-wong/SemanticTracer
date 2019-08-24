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

    setValue(value, indexes, isIncr) {
        if (isIncr === undefined) {
            isIncr = false;
        }

        if (indexes === undefined) {
            indexes = [];
        }

        if (indexes.length !== this.dataType.arrayIndexes.length) {
            platform.programFail(`unmatched index dimension`);
        }

        if (indexes.length === 0) {
            if (isIncr) {
                this.value += value;
            } else {
                this.value = value;
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

        if (isIncr) {
            v[indexes[-1]] += value;
        } else {
            v[indexes[-1]] = value;
        }

        return;
    }

    setValueIncr(value, indexes) {
        this.setValue(value, indexes, true);
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
}

module.exports = Variable;
