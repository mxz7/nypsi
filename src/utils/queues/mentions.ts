import BeeQueue = require("bee-queue");
import { Mention } from "@prisma/client";
import prisma from "../../init/database";
import redis from "../../init/redis";
import sleep from "../functions/sleep";
import { encrypt } from "../functions/string";
import { MentionQueueItem } from "../functions/users/mentions";
import { hasProfile } from "../functions/users/utils";
import { logger } from "../logger";
import ms = require("ms");

const mentionQueueHandler = new BeeQueue<MentionQueueItem>("nypsi:mentions", {
  redis: redis,
});

let done = 0;
setInterval(() => {
  logger.info(`${done.toLocaleString()} mentions sent to database in the last hour`);
  done = 0;
}, ms("1 hour"));

export function handleMentionQueue() {
  mentionQueueHandler.process(7, async (job) => {
    const item = job.data;

    if (!item) return;
    if (!item.members || item.members.length === 0) return;
    if (!item.channelMembers || item.channelMembers.length === 0) return;

    item.content = item.content.replace(/(\r\n|\n|\r)/gm, " ");
    item.content = encrypt(item.content);

    const currentInsert: Mention[] = [];

    for (const member of item.members) {
      await sleep(10);

      if (!item.channelMembers.includes(member)) continue;
      if (!(await hasProfile(member))) continue;

      // @ts-expect-error
      currentInsert.push({
        content: item.content,
        date: new Date(item.date),
        guildId: item.guildId,
        targetId: member,
        url: item.url,
        userTag: item.username,
      });

      if (currentInsert.length >= 1000) {
        await prisma.mention.createMany({ data: currentInsert });
        done += currentInsert.length;
        currentInsert.length = 0;
      }
    }

    if (currentInsert.length > 0) {
      await prisma.mention.createMany({ data: currentInsert });
      done += currentInsert.length;
      currentInsert.length = 0;
    }
  });
}
