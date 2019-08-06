const Token = require('./interpreter');

const AstEnum = {
    AstNone: 0,
    AstOperator: 1,
    AstDeclaration: 2,
    AstAssign: 3,
    AstExpression: 4,
    AstIf: 5,
    AstWhile: 6,
    AstFor: 7,
    AstDoWhile: 8,
    AstStruct: 9,
    AstUnion: 10,
    AstEnum: 11,
    AstFuncDef: 12,
    AstFuncCall: 13,
    AstTypedef: 14,
    AstIndexOp: 15,
    AstMemberOp: 16,
    AstPtrMemberOp: 17,
    AstIdentifier: 18,
    AstStatements: 19,
    AstConstant: 20
};

const AstNames = [
];

//console.log(AstNames[AstEnum.AstIdentifier]);
module.exports = AstEnum;
