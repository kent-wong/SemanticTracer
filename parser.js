const BaseType = require('./basetype');
const ValueType = require('./valuetype');
const Value = require('./value');
const Lexer = require('./lexer');
const Scopes = require('./scopes');

class Parser {
    constructor(filename) {
        this.lexer = new Lexer(filename);
    }
}

const parser = new Parser('./test.c');
