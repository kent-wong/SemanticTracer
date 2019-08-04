
class Value {
    constructor(type, value, props) {
        if (props === undefined) {
            props = {};
        }

        this.type = type;
        this.value = value;
        this.isLValue = props.isLValue !== undefined ? props.isLValue : false;

        if (props.lvalueFrom !== undefined) {
            this.lvalueFrom = props.lvalueFrom;
        }
    }
}

module.exports = Value;
