const platform = {
    programFail(message) {
        console.log(message);
        process.exit(1);
    }
};

module.exports = platform;
