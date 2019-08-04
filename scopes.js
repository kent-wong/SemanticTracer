
class Scope {
    constructor(name) {
        this.name = name;
        this.idents = new Map();
    }

    getIdent(name) {
        return this.idents.get(name);
    }

    setIdent(name, value) {
        this.idents.set(name, value);
    }
}

class Scopes {
    constructor() {
        this.global = new Scope('global');
        this.locals = [];
        this.currentScope = this.global;
    }

    pushScope(scope) {
        this.currentScope = scope;
        return this.locals.unshift(scope);
    }

    popScope() {
        const old = this.locals.shift();
        if (this.locals.length > 0) {
            this.currentScope = this.locals[0];
        } else {
            this.currentScope = this.global;
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
console.log(sc.currentScope);
sc.pushScope(new Scope('func1'));
console.log(sc.currentScope);

module.exports = Scopes;
