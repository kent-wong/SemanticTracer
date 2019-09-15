const utils = require('./utils');

class ArrayInit {
    constructor(indexes, initValues) {
        this.indexes = indexes;
        this.initValues = initValues;

        // 对变量的值使用null填充
        this.values = [];
        this.values.length = utils.factorial(...indexes);
        this.values.fill(null);
    }

    doInit() {
        this.expand(0, this.indexes, this.initValues);
        return this.values;
    }

    expand(start, indexes, initValues) {
        let pos = 0;
        let elem;
        let i;

        if (initValues.length === 0) {
            return ;
        }

        // 计算扩展点
        const expansionPoints = utils.expansionPoints(indexes);

        const range = utils.factorial(...indexes);
        while (pos < range) {
            elem = initValues.shift();
            if (Array.isArray(elem)) {
                // 查看是否处于扩展点上
                for (i = 0; i < expansionPoints.length; i ++) {
                    if (pos % expansionPoints[i] === 0) {
                        break;
                    }
                }

                if (i < expansionPoints.length) {
                    // 在扩展点上则进行递归扩展
                    let subIndexes = indexes.slice(i+1);
                    this.expand(start + pos, subIndexes, elem);
                    pos += utils.factorial(...subIndexes);
                } else {
                    // 不在扩展点则取其第一个元素
                    elem = utils.firstElement(elem);
                    this.values[start+pos] = elem;
                    pos ++
                }
            } else {
                this.values[start+pos] = elem;
                pos ++
            }

            if (initValues.length === 0) {
                break;
            }
        }
        return ;
    }
}

/*
const a = new ArrayInit([2, 3, 4], [[[1, 2], 10, 20], 3, 4, 5, 6, 7, 8, 9]);
console.log(a.doInit());
*/

module.exports = ArrayInit;
