
class Scope {
    constructor(name) {
        this.name = name;
        this.idents = new Map();
        this.types = new Map();
    }

    getIdent(name) {
        return this.idents.get(name);
    }

    setIdent(name, value) {
        this.idents.set(name, value);
    }

    getType(name) {
        return this.types.get(name);
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

    pushScope(scope) {
        this.current = scope;
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
                if (result !== undefined) {
                    return result;
                }
            }
        }

        return global.getIdent(ident);
    }

    findGlobalIdent(ident) {
        this.findIdent(ident, true);
    }
}

const sc = new Scopes();
console.log(sc.current === sc.global);
sc.pushScope(new Scope('func1'));
console.log(sc.current);

module.exports = Scopes;
