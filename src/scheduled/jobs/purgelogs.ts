import dayjs = require("dayjs");
import { readFile, readdir, unlink } from "fs/promises";

(async () => {
  const files = await readdir("./out");

  for (const fileName of files) {
    const file = await readFile(`./out/${fileName}`).then((r) =>
      r
        .toString()
        .split("\n")
        .map((i) => {
          try {
            return JSON.parse(i) as { time: number };
          } catch (e) {
            return undefined;
          }
        })
    );

    let attempts = 0;

    while (attempts < 50) {
      attempts++;
      if (attempts >= 50) break;
      const chosen = Math.floor(Math.random() * file.length);

      if (file[chosen] && file[chosen].time) {
        if (dayjs(file[chosen].time).isBefore(dayjs().subtract(120, "days"))) {
          await unlink(`./out/${fileName}`);
          break;
        }
      }
    }
  }

  process.exit(0);
})();
