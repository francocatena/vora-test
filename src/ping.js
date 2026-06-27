const cp = require("child_process");
const host = process.argv[2];
cp.execSync("ping -c 1 " + host);
