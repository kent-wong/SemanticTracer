const BaseType = require('./basetype');

class ValueType {
    constructor (baseType, numPtrs, ...arrayIndexes) {
        this.baseType = baseType;
        this.numPtrs = numPtrs === undefined ? 0 : numPtrs;
        this.arrayIndexes = arrayIndexes;
    }

    makePointerType() {
        this.numPtrs ++;
    }

    makeStructType(ident, ...members) {
        this.ident = ident;
        this.members = members;
    }

    TypeTag(type) {
        tag = 0;
        switch (type) {
            case Token.TokenStructType:
                tag = 1;
                break;
            case Token.TokenUnionType:
                tag = 2;
                break;
            case Token.TokenTypedef:
                tag = 3;
                break;
            default:
                break;
        }

        return tag;
    }
}

module.exports = ValueType;
