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
    }

    addChild(child) {
        child.siblingIndex = this.childrenTypes.length;
        this.childrenTypes.push(child);
    }
}

module.exports = ValueType;
