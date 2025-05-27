import dayjs = require("dayjs");
import { readFile, readdir, unlink } from "fs/promises";
import prisma from "../../init/database";
import { Job } from "../../types/Jobs";
import { deleteImage } from "../../utils/functions/image";

export default {
  name: "purge",
  cron: "0 1 * * *",
  async run(log) {
    const old = dayjs().subtract(900, "days").toDate();

    const d = await prisma.username.deleteMany({
      where: {
        AND: [{ type: "username" }, { createdAt: { lt: old } }],
      },
    });

    if (d.count > 0) log(`${d.count.toLocaleString()} usernames purged`);

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
            } catch {
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

    log(`${filesCount} logs files deleted`);

    const limit = dayjs().subtract(1, "weeks").toDate();

    const c = await prisma.mention.deleteMany({
      where: {
        date: { lte: limit },
      },
    });

    if (c.count > 0) log(`${c.count} mentions purged`);

    const roleLimit = dayjs().subtract(30, "days").toDate();

    const query = await prisma.rolePersist.deleteMany({
      where: {
        createdAt: { lt: roleLimit },
      },
    });

    log(`${query.count.toLocaleString()} role persist data purged`);

    const views = await prisma.profileView.deleteMany({
      where: {
        createdAt: { lte: dayjs().subtract(30, "day").toDate() },
      },
    });

    if (views.count > 0) log(`${views.count.toLocaleString()} monthly views purged`);

    const supportImages = await prisma.images.findMany({
      where: {
        AND: [
          { id: { startsWith: "support/" } },
          { createdAt: { lt: dayjs().subtract(180, "day").toDate() } },
        ],
      },
      select: {
        id: true,
      },
    });

    for (const image of supportImages) {
      await deleteImage(image.id);
    }
    log(`deleted ${supportImages.length} support images`);

    const searchResults = await prisma.images.findMany({
      where: {
        AND: [
          { id: { startsWith: "search_result" } },
          { createdAt: { lt: dayjs().subtract(1, "day").toDate() } },
        ],
      },
    });

    for (const image of searchResults) {
      await deleteImage(image.id);
    }
    log(`deleted ${searchResults.length} search results`);
  },
} satisfies Job;
