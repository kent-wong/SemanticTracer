function isEqualArray(arr1, arr2) {
    if (arr1.length !== arr2.length) {
        return false;
    }

    for (let i = 0; i < arr1.length; i ++) {
        if (arr1[i] !== arr2[i]) {
            return false;
        }
    }

    return true;
}

function factorial(...numbers) {
    let result = 1;
    for (let n of numbers) {
        if (n === 0) {
            return 0;
        }
        result *= n;
    }

    return result;
}

function expansionPoints(indexes) {
    const expansion = [];
    let reversed = indexes.slice().reverse();
    reversed.pop();

    let result = 1;
    for (let idx of reversed) {
        result *= idx;
        expansion.unshift(result);
    }

    return expansion;
}

function accessIndexesFromPosition(pos, arrayIndexes) {
    const indexes = [];
    const expansion= expansionPoints(arrayIndexes); 

    for (let e of expansion) {
        indexes.push(Math.floor(pos/e));
        pos = pos % e;
    }
    indexes.push(pos);

    return indexes;
}

module.exports = {
    isEqualArray,
    factorial,
    expansionPoints,
    accessIndexesFromPosition
};
