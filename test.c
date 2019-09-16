
struct aStruct {
    int a;
    int b[2];
    int c;
};

struct aStruct abc[2] = {100, {1, 2, 3}, 200, 10};

/*
// enum测试
enum aEnum {
    Sunday = 100,
    Monday,
    Tuesday
};

enum bEnum {
    First,
    Second,
    Third
};

int a = Monday + Third;
*/

/*
struct aStruct {
    int a;
    int b[2];
};

struct bStruct {
    struct aStruct *pField[3];
};

struct aStruct aaa;
struct bStruct bbb;

bbb.pField[1] = &aaa;
bbb.pField[1]->a = 100;
bbb.pField[1]->b[0] = 200;
bbb.pField[1]->b[1] = 300;
*/

/*
struct aStruct abc;
abc.b[1] = 123;

struct some1 {
    struct some abc;
};

struct some1 sss;

int a = 100;
int b = 1;
*/

//b = a >= 100 ? b == 0 ? 0 : 1234 : a;

/*
int arr[2][3] = { 100, 200, 300 };
int arr1[3] = { 111, 222, 333 };

int max(int a) {
    return a;
}

int c = 123;
c = max(100);
*/




/*
int arr[2][3] = { 100, 200, 300 };
int a = 100, c;
int *p;



p = &arr[0][1];
c = ++ arr[0][2];
p ++;

c = *p ++;

for (int i = 0; i < 2; i ++) {
    for (int j = 0; j < 3; j ++) {
        if (j == 1) {
            continue;
        }
        arr[i][j] = 123;
    }
}
*/
