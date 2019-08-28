
class Scope {
    constructor(name) {
        this.name = name;
        this.idents = new Map();
        this.types = new Map();
    }

    getIdent(name) {
        const result = this.idents.get(name);
        if (result === undefined) {
            result = null;
        }
        return result;
    }

    setIdent(name, value) {
        this.idents.set(name, value);
    }

    getType(name) {
        const result = this.types.get(name);
        if (result === undefined) {
            result = null;
        }
        return result;
    }

    setType(name, value) {
        this.types.set(name, value);
    }
}

class Scopes {
    constructor() {
        this.global = new Scope('global');
        this.locals = [];
        this.current = this.global;
    }

    pushScope(name) {
        const scope = new Scope(name);
        this.current = scope;
        // 最近的scope插入到数组的最前面，便于后面进行遍历
        return this.locals.unshift(scope);
    }

    popScope() {
        const old = this.locals.shift();
        if (this.locals.length > 0) {
            this.current = this.locals[0];
        } else {
            this.current = this.global;
        }
    }

    findIdent(ident, onlyGlobal) {
        if (onlyGlobal === undefined) {
            onlyGlobal = false;
        }

        if (!onlyGlobal && this.locals.length > 0) {
            let result = null;
            for (let scope of this.locals) {
                result = scope.getIdent(ident);
                if (result !== null) {
                    return result;
                }
            }
        }

        return global.getIdent(ident);
    }

    findGlobalIdent(ident) {
        return this.findIdent(ident, true);
    }

    addIdent(ident, value) {
        this.current.setIdent(ident, value);
    }
}

const sc = new Scopes();
console.log(sc.current === sc.global);
sc.pushScope(new Scope('func1'));
sc.addIdent('abc', 'int');
console.log(sc.current);
console.log(sc.findIdent('abc'));
console.log('-------------------------------');

module.exports = Scopes;
