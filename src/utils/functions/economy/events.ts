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
import { CustomEmbed } from "../../../models/EmbedBuilders";
import Constants from "../../Constants";
import { getUserId, MemberResolvable } from "../member";
import { addNotificationToQueue } from "../users/notifications";
import { addAchievementProgress } from "./achievements";
import { addInventoryItem } from "./inventory";
import { getEventsData, getItems } from "./utils";
import ms = require("ms");

export type EventData = Event & { contributions: EventContribution[] };

const REWARDS_TOP25P = 4;
const REWARDS_TOP50P = 2;
const REWARDS_BOTTOM50P = 1;

export async function createEvent(
  client: NypsiClient,
  member: MemberResolvable,
  type: string,
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
            `the **${getEventsData()[type].name}** event has started!!\n\n` +
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

  return Number(event.contributions.reduce((acc, cur) => acc + cur.contribution, 0n));
}

async function giveRewards(event: EventData) {
  if (!event) return undefined;

  const top10p = event.contributions.slice(0, Math.floor(event.contributions.length / 10));
  const top25p = event.contributions.slice(0, Math.floor(event.contributions.length / 4));
  const top50p = event.contributions.slice(0, Math.floor(event.contributions.length / 2));
  const bottom50p = event.contributions
    .toReversed()
    .slice(0, Math.floor(event.contributions.length / 2));

  for (const { userId } of top10p) {
    await addAchievementProgress(userId, "event_pro");
  }

  // userid -> amount
  const givenRewards = new Map<string, number>();

  const giveRewardToGroup = async (group: EventContribution[], toGive: number) => {
    while (toGive > 0) {
      toGive--;
      const chosen = group[Math.floor(Math.random() * group.length)];

      if (!givenRewards.has(chosen.userId)) {
        givenRewards.set(chosen.userId, 0);
      }

      givenRewards.set(chosen.userId, givenRewards.get(chosen.userId) + 1);
      await addInventoryItem(chosen.userId, "pandora_box", 1);
    }
  };

  await giveRewardToGroup(top25p, REWARDS_TOP25P);
  await giveRewardToGroup(top50p, REWARDS_TOP50P);
  await giveRewardToGroup(bottom50p, REWARDS_BOTTOM50P);

  for (const [userId, amount] of givenRewards) {
    await addNotificationToQueue({
      memberId: userId,
      payload: {
        embed: new CustomEmbed(
          userId,
          `you have received **${amount}x** ${getItems()["pandora_box"].emoji} ${getItems()["pandora_box"].name} ` +
            `for participating in the **${getEventsData()[event.type].name} event**!!`,
        ),
      },
    });
  }

  return givenRewards;
}
