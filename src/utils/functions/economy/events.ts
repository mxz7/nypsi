import dayjs = require("dayjs");
import { Event } from "@prisma/client";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import { NypsiClient } from "../../../models/Client";
import Constants from "../../Constants";
import { getUserId, MemberResolvable } from "../member";
import ms = require("ms");

export async function createEvent(
  client: NypsiClient,
  member: MemberResolvable,
  type: string,
  title: string,
  target: string,
  days: number,
) {
  const userId = getUserId(member);

  const check = await prisma.event.findFirst({
    where: {
      completed: false,
    },
  });

  if (check) {
    return "event already in process";
  }

  await prisma.event.create({
    data: {
      ownerId: userId,
      type,
      title,
      target,
      expiresAt: dayjs()
        .add(days, "day")
        .set("hours", 0)
        .set("minute", 0)
        .set("second", 0)
        .set("millisecond", 0)
        .toDate(),
    },
  });

  const targetChannel =
    client.user.id === Constants.BOT_USER_ID
      ? Constants.ANNOUNCEMENTS_CHANNEL_ID
      : "819640200699052052"; // dev channel

  const clusters = await client.cluster.broadcastEval(
    (client, { channelId }) => {
      const guild = client.channels.cache.get(channelId);

      if (guild) return (client as unknown as NypsiClient).cluster.id;
      return "not-found";
    },
    { context: { channelId: targetChannel } },
  );

  let cluster: number;

  for (const i of clusters) {
    if (i != "not-found") {
      cluster = i;
      break;
    }
  }

  await client.cluster
    .broadcastEval(
      async (client, { content, channelId, cluster }) => {
        if ((client as unknown as NypsiClient).cluster.id != cluster) return;

        const channel = client.channels.cache.get(channelId);

        if (!channel) return;

        if (channel.isTextBased() && channel.isSendable()) {
          await channel.send({ content });
        }
      },
      {
        context: {
          content: `the **${title}** event has started!!\n` + `<@&${Constants.EVENTS_ROLE_ID}>`,
          channelId: targetChannel,
          cluster: cluster,
        },
      },
    )
    .then((res) => {
      return res.filter((i) => Boolean(i));
    });
}

export async function getCurrentEvent(useCache = true) {
  if (useCache) {
    const cache = await redis.get(Constants.redis.cache.economy.event);

    if (cache) {
      if (cache === "none") {
        return undefined;
      } else {
        return JSON.parse(cache) as Event;
      }
    }
  }

  const query = await prisma.event.findFirst({
    where: {
      AND: [{ completed: false, expiresAt: { gt: new Date() } }],
    },
  });

  if (query) {
    await redis.set(
      Constants.redis.cache.economy.event,
      JSON.stringify(query),
      "EX",
      Math.min(query.expiresAt.getTime(), ms("12 hours")) / 1000,
    );
  } else {
    await redis.set(Constants.redis.cache.economy.event, "none");
  }

  return query;
}
