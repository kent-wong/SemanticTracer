
class Value {
    constructor(ident, type, value, isLValue, lvalueFrom) {
        this.ident = ident;
        this.type = type;
        this.value = value;
        this.isLValue = isLValue !== undefined ? isLValue : false;
        this.lvalueFrom = lvalueFrom !== undefined ? lvalueFrom : null;
    }
}

module.exports = Value;
