const BaseType = require('./basetype');

class ValueType {
    constructor (baseType, props) {
        if (props === undefined) {
            props = {};
        }

        this.baseType = baseType;
        this.arrayLength = props.arrayLength !== undefined ? props.arrayLength : 0;
        this.totalSize = 0;
        this.alignBytes = 0;
        this.isStatic = false;

        if (props.identifier !== undefined) {
            this.identifier = props.identifier;
        }
    }
}

module.exports = ValueType;
