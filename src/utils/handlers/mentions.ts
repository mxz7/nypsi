import { Mention } from "@prisma/client";
import prisma from "../../init/database";
import redis from "../../init/redis";
import Constants from "../Constants";
import sleep from "../functions/sleep";
import { encrypt } from "../functions/string";
import { MentionQueueItem } from "../functions/users/mentions";

let beingDone = 0;

export function startMentionInterval() {
  setInterval(async () => {
    if (beingDone >= 3 || (await redis.llen(Constants.redis.nypsi.MENTION_QUEUE)) < 1) return;

    addMention(JSON.parse(await redis.lpop(Constants.redis.nypsi.MENTION_QUEUE)));
  }, 10000);
}

async function addMention(item: MentionQueueItem) {
  if (!item) return;
  if (!item.members || item.members.length === 0) return;
  if (!item.channelMembers || item.channelMembers.length === 0) return;

  beingDone++;

  item.content = item.content.replace(/(\r\n|\n|\r)/gm, " ");

  item.content = encrypt(item.content);

  const currentInsert: Mention[] = [];

  for (const member of item.members) {
    await sleep(Number(await redis.get("nypsi:mention:delay")) || 5);
    if (!item.channelMembers.includes(member)) return;
    currentInsert.push({
      content: item.content,
      date: new Date(item.date),
      guildId: item.guildId,
      targetId: member,
      url: item.url,
      userTag: item.username,
    });

    if (currentInsert.length >= 750) {
      await prisma.mention.createMany({ data: currentInsert, skipDuplicates: true });
      currentInsert.length = 0;
    }
  }

  if (currentInsert.length > 0) {
    await prisma.mention.createMany({ data: currentInsert, skipDuplicates: true });
  }

  beingDone--;
}
