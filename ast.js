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
    AstBlock: 19,
    AstConstant: 20,
    AstPrefixOp: 21,
    AstPostfixOp: 22,
    AstTakeAddress: 23,
    AstTakeValue: 24,
    AstUMinus: 25,
    AstUnaryNot: 26,
    AstUnaryExor: 27,
    AstSwitch: 28,
    AstParam: 29,
    AstList: 30,
    AstReturn: 31,
    AstBreak: 32,
    AstContinue: 33,
    AstTernary: 34,
    AstVariable: 35,
    AstArrayInitializer: 36,
    AstRefByPtr: 37,
    AstRefByDot: 38,

    createList: function(...astList) {
        return {
            astType: this.AstList,
            astList: astList
        };
    },

    getAstName(ast) {
        return AstNames[ast];
    }
};

const AstNames = [
    "AstNone",
    "AstOperator",
    "AstDeclaration",
    "AstAssign",
    "AstExpression",
    "AstIf",
    "AstWhile",
    "AstFor",
    "AstDoWhile",
    "AstStruct",
    "AstUnion",
    "AstEnum",
    "AstFuncDef",
    "AstFuncCall",
    "AstTypedef",
    "AstIndexOp",
    "AstMemberOp",
    "AstPtrMemberOp",
    "AstIdentifier",
    "AstBlock",
    "AstConstant",
    "AstPrefixOp",
    "AstPostfixOp",
    "AstTakeAddress",
    "AstTakeValue",
    "AstUMinus",
    "AstUnaryNot",
    "AstUnaryExor",
    "AstSwitch",
    "AstParam",
    "AstList",
    "AstReturn",
    "AstBreak",
    "AstContinue",
    "AstTernary",
    "AstVariable",
    "AstArrayInitializer",
    "AstRefByPtr",
    "AstRefByDot"
];

module.exports = AstEnum;
//console.log(AstEnum.getAstName(AstEnum.AstIdentifier));
