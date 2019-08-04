const BaseTypeEnum = {
	TypeVoid: 1,                   /* no type */
    TypeInt: 2,                    /* integer */
    TypeShort: 3,                  /* short integer */
    TypeChar: 4,                   /* a single character (signed) */
    TypeLong: 5,                   /* long integer */
    TypeUnsignedInt: 6,            /* unsigned integer */
    TypeUnsignedShort: 7,          /* unsigned short integer */
    TypeUnsignedChar: 8,           /* unsigned 8-bit number */ /* must be before unsigned long */
    TypeUnsignedLong: 9,           /* unsigned long integer */
    TypeFP: 10,                     /* floating point */
    TypeFunction: 11,               /* a function */
    TypeMacro: 12,                  /* a macro */
    TypePointer: 13,                /* a pointer */
    TypeArray: 14,                  /* an array of a sub-type */
    TypeStruct: 15,                 /* aggregate type */
    TypeUnion: 16,                  /* merged type */
    TypeEnum: 17,                   /* enumerated integer type */
    TypeGotoLabel: 18,              /* a label we can "goto" */
    Type_Type: 19,                  /* a type for storing types */
	TypeIdentifier: 20
};

module.exports = BaseTypeEnum;
