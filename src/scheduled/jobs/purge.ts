import dayjs = require("dayjs");
import { readFile, readdir, unlink } from "fs/promises";
import { parentPort } from "worker_threads";
import prisma from "../../init/database";

(async () => {
  const old = dayjs().subtract(365, "days").toDate();

  const d = await prisma.username.deleteMany({
    where: {
      AND: [{ type: "username" }, { date: { lt: old } }],
    },
  });

  if (d.count > 0) {
    parentPort.postMessage(`${d.count.toLocaleString()} usernames purged`);
  }

  const files = await readdir("./out");
  let filesCount = 0;

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
        }),
    );

    let attempts = 0;

    while (attempts < 50) {
      attempts++;
      if (attempts >= 50) break;
      const chosen = Math.floor(Math.random() * file.length);

      if (file[chosen] && file[chosen].time) {
        if (dayjs(file[chosen].time).isBefore(dayjs().subtract(120, "days"))) {
          filesCount++;
          await unlink(`./out/${fileName}`);
          break;
        }
      }
    }
  }

  parentPort.postMessage(`${filesCount} logs files deleted`);

  const limit = dayjs().subtract(2, "weeks").toDate();

  const c = await prisma.mention.deleteMany({
    where: {
      date: { lte: limit },
    },
  });

  if (c.count > 0) {
    parentPort.postMessage(`${c.count} mentions purged`);
  }

  const roleLimit = dayjs().subtract(30, "days").toDate();

  const query = await prisma.rolePersist.deleteMany({
    where: {
      createdAt: { lt: roleLimit },
    },
  });

  parentPort.postMessage(`${query.count.toLocaleString()} role persist data purged`);

  const wholesomeSuggestionCount = await prisma.wholesomeSuggestion.count();

  if (wholesomeSuggestionCount == 0) {
    await prisma.$executeRaw`ALTER SEQUENCE "WholesomeSuggestion_id_seq" RESTART WITH 1;`;
    parentPort.postMessage("reset wholesome suggestion count");
  }

  const views = await prisma.profileView.deleteMany({
    where: {
      createdAt: { lte: dayjs().subtract(30, "day").toDate() },
    },
  });

  if (views.count > 0)
    parentPort.postMessage(`${views.count.toLocaleString()} monthly views purged`);

  parentPort.postMessage("done");
})();
