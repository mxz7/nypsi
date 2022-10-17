import dayjs = require("dayjs");
import * as fs from "fs/promises";
import { parentPort } from "worker_threads";

(async () => {
  const files = await fs.readdir("./out/logs").then((files) => files.filter((file) => file.includes(".log")));

  let deleteCount = 0;

  for (const fileName of files) {
    const x = fileName.split(".")[0].split("-");
    x.splice(0, 1);
    const date = x.join("-");

    if (dayjs(date).isBefore(dayjs().subtract(90, "days"))) {
      await fs.unlink(`./out/logs/${fileName}`);
      deleteCount++;
    }
  }

  parentPort.postMessage(`deleted ${deleteCount.toLocaleString()} old log files`);

  process.exit(0);
})();
