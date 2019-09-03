const Token = require('./interpreter');
const BaseType = require('./basetype');
const Ast = require('./ast');

function debugShowArray(arr, ident) {
    let first = true;
    let str;
    for (let v of arr) {
        if (v !== null && typeof v === 'object') {
            console.log(' '.repeat(ident) + '{');
            debugShowObject(v, ident+4);
            str = ' '.repeat(ident) + '}';
        } else {
            str = ' '.repeat(ident) + v;
        }
        if (!first) {
            str += ','
        }
        console.log(str);
        first = false;
    }
}

function debugShowObject(obj, ident) {
    const keys = Object.keys(obj);

    let v;
    for (let k of keys) {
        v = obj[k];

        if (k === 'astType') {
            console.log(' '.repeat(ident)+k+':', Ast.getAstName(v) + '(' + v + ')');
        } else if (k === 'astBaseType') {
            console.log(' '.repeat(ident)+k+':', BaseType.getTypeName(v) + '(' + v + ')');
        } else if (k === 'token') {
            console.log(' '.repeat(ident)+k+':', Token.getTokenName(v) + '(' + v + ')');
        } else if (Array.isArray(v)) {
            if (v.length !== 0) {
                console.log(' '.repeat(ident)+k+': ' + '[');
                debugShowArray(v, ident+4);
                console.log(' '.repeat(ident) + ']');
            } else {
                console.log(' '.repeat(ident)+k+': ' + '[]');
            }
        } else if (v !== null && typeof v === 'object') {
            console.log(' '.repeat(ident)+k+': ' + '{');
            debugShowObject(v, ident+4);
            console.log(' '.repeat(ident) + '}');
        } else {
            console.log(' '.repeat(ident)+k+':', v);
        }
    }
}

function debugShow(target) {
    if (typeof target === 'object') {
        console.log('{');
        debugShowObject(target, 4);
        console.log('}');
    } else {
        console.log(target);
    }
}

module.exports = {
    debugShow
};
