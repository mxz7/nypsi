import dayjs = require("dayjs");
import { Event, EventContribution } from "@prisma/client";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageActionRowComponentBuilder,
} from "discord.js";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import { NypsiClient } from "../../../models/Client";
import Constants from "../../Constants";
import { getUserId, MemberResolvable } from "../member";
import { getEventsData } from "./utils";
import ms = require("ms");

export type EventData = Event & { contributions: EventContribution[] };

export async function createEvent(
  client: NypsiClient,
  member: MemberResolvable,
  type: string,
  title: string,
  target: number,
  days: number,
) {
  const userId = getUserId(member);

  const check = await getCurrentEvent(true);

  if (check) {
    return "event already in process";
  }

  if (!getEventsData()[type]) {
    return "invalid event type";
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
          content:
            `the **${title}** event has started!!\n\n` +
            `${getEventsData()[type].description.replace("{target}", target.toLocaleString())}\n\n` +
            `<@&${Constants.EVENTS_ROLE_ID}>`,
          components: new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
            new ButtonBuilder()
              .setStyle(ButtonStyle.Link)
              .setLabel("live progress")
              .setEmoji("🏆")
              .setURL("https://nypsi.xyz/events?ref=bot-event-announcement"),
            new ButtonBuilder()
              .setStyle(ButtonStyle.Link)
              .setLabel("more information")
              .setEmoji("📜")
              .setURL("https://nypsi.xyz/docs/economy/events?ref=bot-event-announcement"),
          ),
          channelId: targetChannel,
          cluster: cluster,
        },
      },
    )
    .then((res) => {
      return res.filter((i) => Boolean(i));
    });
}

export async function getCurrentEvent(useCache = true): Promise<EventData> {
  if (useCache) {
    const cache = await redis.get(Constants.redis.cache.economy.event);

    if (cache) {
      if (cache === "none") {
        return undefined;
      } else {
        return JSON.parse(cache);
      }
    }
  }

  const query = await prisma.event.findFirst({
    where: {
      AND: [{ completed: false, expiresAt: { gt: new Date() } }],
    },
    include: {
      contributions: {
        orderBy: { contribution: "desc" },
      },
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

export async function trackEventProgress(user: MemberResolvable, type: string, amount: number) {
  const event = await getCurrentEvent();

  if (!event) {
    return;
  }

  if (!getEventsData()[type]) {
    throw new Error(`invalid event type: ${type}`);
  }

  const userId = getUserId(user);

  await prisma.eventContribution.upsert({
    where: {
      userId_eventId: {
        userId,
        eventId: event.id,
      },
    },
    update: {
      contribution: {
        increment: amount,
      },
    },
    create: {
      userId,
      eventId: event.id,
      contribution: amount,
    },
  });

  return getEventProgress(event) + amount;
}

export function getEventProgress(event: EventData) {
  if (!event) {
    return 0;
  }

  return Number(event.EventContribution.reduce((acc, cur) => acc + cur.contribution, 0n));
}
