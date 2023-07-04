import { Mention } from "@prisma/client";
import prisma from "../../init/database";
import redis from "../../init/redis";
import Constants from "../Constants";
import sleep from "../functions/sleep";
import { encrypt } from "../functions/string";
import { MentionQueueItem } from "../functions/users/mentions";

export function startMentionInterval() {
  setInterval(async () => {
    if (
      (Number(await redis.get(Constants.redis.nypsi.MENTION_CURRENT)) || 0) >=
        (Number(await redis.get(Constants.redis.nypsi.MENTION_MAX)) || 3) ||
      (await redis.llen(Constants.redis.nypsi.MENTION_QUEUE)) < 1
    )
      return;

    for (
      let i = Number(await redis.get(Constants.redis.nypsi.MENTION_CURRENT)) || 0;
      i < (Number(await redis.get(Constants.redis.nypsi.MENTION_MAX)) || 3);
      await redis.set(Constants.redis.nypsi.MENTION_CURRENT, i + 1)
    ) {
      addMention(JSON.parse(await redis.lpop(Constants.redis.nypsi.MENTION_QUEUE)))
        .then(async () => {
          redis.set(
            Constants.redis.nypsi.MENTION_CURRENT,
            Number((await redis.get(Constants.redis.nypsi.MENTION_CURRENT)) || 1) - 1
          );
        })
        .catch(async () => {
          redis.set(
            Constants.redis.nypsi.MENTION_CURRENT,
            Number((await redis.get(Constants.redis.nypsi.MENTION_CURRENT)) || 1) - 1
          );
        });
    }
  }, 5000);
}

async function addMention(item: MentionQueueItem) {
  if (!item) return;
  if (!item.members || item.members.length === 0) return;
  if (!item.channelMembers || item.channelMembers.length === 0) return;

  item.content = item.content.replace(/(\r\n|\n|\r)/gm, " ");

  item.content = encrypt(item.content);

  const currentInsert: Mention[] = [];

  for (const member of item.members) {
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
      currentInsert.length = 0;
    }
  }

  if (currentInsert.length > 0) {
    await prisma.mention.createMany({ data: currentInsert });
  }
}
