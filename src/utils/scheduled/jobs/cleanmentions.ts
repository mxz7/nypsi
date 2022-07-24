import Database = require("better-sqlite3");
import dayjs = require("dayjs");
import { parentPort } from "worker_threads";

const db = new Database("./out/data/storage.db");

(() => {
    const limit = Math.floor(dayjs().subtract(1, "day").unix() / 1000);

    const { changes } = db.prepare("DELETE FROM mentions WHERE date < ?").run(limit);

    if (changes > 0) {
        parentPort.postMessage(`${changes} mentions deleted`);
    }
    process.exit(0);
})();
