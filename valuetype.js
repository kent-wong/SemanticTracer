const BaseType = require('./basetype');

class ValueType {
    constructor (baseType, parentType, arrayLength, ident) {
        this.baseType = baseType;
        this.arrayLength = arrayLength !== undefined ? arrayLength : 0;
        this.parentType = parentType !== undefined ? parentType : null;
        this.siblingIndex = 0;
        this.childrenTypes = [];

        this.ident = ident !== undefined ? ident : null;
        this.isStatic = false;

        this.members = [];
    }

    addChild(child) {
        child.siblingIndex = this.childrenTypes.length;
        this.childrenTypes.push(child);
    }

    makePointerType() {
        return new ValueType(BaseType.TypePointer, this);
    }

    makeArrayType(arrayLength) {
        return new ValueType(BaseType.TypeArray, this, arrayLength);
    }
}

const aType = new ValueType(BaseType.TypeInt);
//const aPointer = aType.makePointerType();
//console.log(aPointer);
const aArray = aType.makeArrayType(10);
const aArray2 = aArray.makeArrayType(2);
console.log(aArray2);

module.exports = ValueType;
