import { Mention } from "@prisma/client";
import prisma from "../../init/database";
import redis from "../../init/redis";
import Constants from "../Constants";
import sleep from "../functions/sleep";
import { encrypt } from "../functions/string";
import { MentionQueueItem } from "../functions/users/mentions";
import { addNotificationToQueue } from "../functions/users/notifications";
import { hasProfile } from "../functions/users/utils";
import doMentionsWorker from "../functions/workers/mentions";
import { logger } from "../logger";
import ms = require("ms");

let current = 0;
let lastWarn = 0;
let done = 0;
setInterval(() => {
  logger.info(`${done.toLocaleString()} mentions sent to database in the last hour`);
  done = 0;
}, ms("1 hour"));

export function startMentionInterval() {
  setInterval(async () => {
    if (
      current >= (Number(await redis.get(Constants.redis.nypsi.MENTION_MAX)) || 3) ||
      (await redis.llen(Constants.redis.nypsi.MENTION_QUEUE)) < 1
    )
      return;

    if (
      (await redis.llen(Constants.redis.nypsi.MENTION_QUEUE)) >
        (Number(await redis.get(Constants.redis.nypsi.MENTION_DM_TEKOH_THRESHOLD)) || 100) ||
      (0 && lastWarn < Date.now() - ms("1 hour"))
    ) {
      lastWarn = Date.now();
      addNotificationToQueue({
        memberId: Constants.TEKOH_ID,
        payload: {
          content: `mention queue over threshold: ${Number(
            await redis.llen(Constants.redis.nypsi.MENTION_QUEUE),
          ).toLocaleString()}`,
        },
      });
    }

    for (
      current;
      current < (Number(await redis.get(Constants.redis.nypsi.MENTION_MAX)) || 3);
      current++
    ) {
      const item = await redis.lpop(Constants.redis.nypsi.MENTION_QUEUE);
      if (!item) return;

      addMention(JSON.parse(item))
        .then(async () => {
          current--;
        })
        .catch(async (e) => {
          logger.error("mentions error", e);
          current--;
        });
    }
  }, 1000);
}

async function addMention(item: MentionQueueItem) {
  if (!item) return;
  if (!item.members || item.members.length === 0) return;
  if (!item.channelMembers || item.channelMembers.length === 0) return;

  item.content = item.content.replace(/(\r\n|\n|\r)/gm, " ");

  item.content = encrypt(item.content);

  if (item.members.length >= 10000) {
    logger.info(`${item.members.length.toLocaleString()} mentions being inserted with worker...`);
    const start = Date.now();
    const res = await doMentionsWorker(item).catch((e) => {
      logger.error("error inserting mentions with worker", e);
    });
    if (res === 1) logger.warn("worker timed out");
    logger.debug(
      `${item.members.length.toLocaleString()} mentions inserted in ${
        (Date.now() - start) / 1000
      }s`,
    );
    done += item.members.length;

    return;
  }

  const currentInsert: Mention[] = [];

  for (const member of item.members) {
    if (!(await hasProfile(member))) continue;
    await sleep(Number(await redis.get(Constants.redis.nypsi.MENTION_DELAY)) || 5);
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
      done += currentInsert.length;
      currentInsert.length = 0;
    }
  }

  if (currentInsert.length > 0) {
    await prisma.mention.createMany({ data: currentInsert });
    done += currentInsert.length;
  }
}
