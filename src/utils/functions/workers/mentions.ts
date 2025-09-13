import { Mention } from "@generated/prisma";
import { Worker, isMainThread, parentPort, workerData } from "worker_threads";
import prisma from "../../../init/database";
import { MentionQueueItem } from "../users/mentions";
import ms = require("ms");

export default function doMentionsWorker(item: MentionQueueItem): Promise<number> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(__filename, {
      workerData: [item],
    });
    worker.on("message", resolve);
    worker.on("error", reject);
    worker.on("exit", (code) => {
      if (code !== 0) reject(new Error(`Worker stopped with exit code ${code}`));
    });
  });
}

if (!isMainThread) {
  process.title = "nypsi: mention worker";

  setTimeout(() => {
    parentPort.postMessage(1);
  }, ms("1 hour"));

  (async () => {
    const item: MentionQueueItem = workerData[0];

    const currentInsert: Mention[] = [];

    for (const member of item.members) {
      if (!item.channelMembers.includes(member)) continue;
      // @ts-expect-error weird
      currentInsert.push({
        content: item.content,
        date: new Date(item.date),
        guildId: item.guildId,
        targetId: member,
        url: item.url,
        userTag: item.username,
      });

      if (currentInsert.length >= 750) {
        await prisma.mention.createMany({ data: currentInsert });
        currentInsert.length = 0;
      }
    }

    if (currentInsert.length > 0) {
      await prisma.mention.createMany({ data: currentInsert });
    }

    parentPort.postMessage(0);
    process.exit(0);
  })();
}
