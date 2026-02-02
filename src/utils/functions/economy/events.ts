import { Event, EventContribution } from "#generated/prisma";
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
import { logger } from "../../logger";
import { MStoTime } from "../date";
import { getUserId, MemberResolvable } from "../member";
import { percentChance } from "../random";
import { addNotificationToQueue, getPreferences } from "../users/notifications";
import { getLastKnownUsername } from "../users/username";
import { hasProfile } from "../users/utils";
import { addProgress } from "./achievements";
import { addInventoryItem } from "./inventory";
import { getEventsData, getItems, isEcoBanned } from "./utils";
import ms = require("ms");
import dayjs = require("dayjs");

export type EventData = Event & { contributions: EventContribution[] };

let completing = false;

const REWARDS_TOP5P = 5;
const REWARDS_TOP10P = 7;
const REWARDS_TOP50P = 5;
const REWARDS_BOTTOM50P = 3;

export async function createEvent(
  client: NypsiClient,
  member: MemberResolvable,
  type: string,
  target: number | Date,
): Promise<true | "event already in process" | "invalid event type"> {
  const userId = getUserId(member);

  const check = await getCurrentEvent(true);

  if (check) {
    return "event already in process";
  }

  if (!getEventsData()[type]) {
    return "invalid event type";
  }

  let progressTarget: number;
  let date: Date;

  if (typeof target === "number") {
    progressTarget = target;
    date = null;
  } else {
    date = dayjs(target)
      .set("hours", 0)
      .set("minute", 0)
      .set("second", 0)
      .set("millisecond", 0)
      .toDate();
    progressTarget = null;
  }

  const event = await prisma.event.create({
    data: {
      ownerId: userId,
      type,
      target: progressTarget,
      expiresAt: date,
    },
  });

  await redis.del(Constants.redis.cache.economy.event, Constants.redis.cache.economy.eventProgress);

  let message =
    `🔱 the **${getEventsData()[type].name}** event has started!!\n\n` +
    `> ${formatEventDescription(event)}\n\n`;

  if (event.expiresAt) {
    message += `ends on <t:${Math.floor(event.expiresAt.getTime() / 1000)}> (<t:${Math.floor(event.expiresAt.getTime() / 1000)}:R>)\n\n`;
  }

  message += `<@&${Constants.EVENTS_ROLE_ID}>`;

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
      async (client, { content, channelId, cluster, components }) => {
        if ((client as unknown as NypsiClient).cluster.id != cluster) return;

        const channel = client.channels.cache.get(channelId);

        if (!channel) return;

        if (channel.isTextBased() && channel.isSendable()) {
          const msg = await channel.send({ content, components: [components] });
          msg.crosspost().catch(() => {});
        }
      },
      {
        context: {
          content: message,
          components: new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
            new ButtonBuilder()
              .setStyle(ButtonStyle.Link)
              .setLabel("live progress")
              .setEmoji("🏆")
              .setURL("https://nypsi.xyz/events?ref=bot-event-announcement"),
            new ButtonBuilder()
              .setStyle(ButtonStyle.Link)
              .setLabel("what's this?")
              .setEmoji("❓")
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

  return true;
}

export async function getCurrentEvent(useCache = true): Promise<EventData> {
  if (useCache) {
    const cache = await redis.get(Constants.redis.cache.economy.event);

    if (cache) {
      if (cache === "none") {
        return undefined;
      } else {
        const data: EventData = JSON.parse(cache);

        data.createdAt = new Date(data.createdAt);
        data.expiresAt = data.expiresAt ? new Date(data.expiresAt) : null;
        data.endedAt = data.endedAt ? new Date(data.endedAt) : null;

        return data;
      }
    }
  }

  let query = await prisma.event.findFirst({
    where: {
      endedAt: null,
    },
    include: {
      contributions: {
        orderBy: [{ contribution: "desc" }, { user: { lastKnownUsername: "asc" } }],
      },
    },

    // this assumes that the only active event is the most recent one, take 1 is assumed by findFirst
    orderBy: { id: "desc" },
  });

  if (query && hasEventCompleted(query)) {
    // something broken with the event that was fetched
    query = undefined;
  }

  if (query) {
    await redis.set(
      Constants.redis.cache.economy.event,
      JSON.stringify(query),
      "EX",
      Math.min(query.expiresAt?.getTime() || ms("12 hours"), ms("12 hours")) / 1000,
    );
  } else {
    await redis.set(Constants.redis.cache.economy.event, "none");
  }

  return query;
}

export async function addEventProgress(
  client: NypsiClient,
  user: MemberResolvable,
  type: string,
  amount: number,
) {
  const userId = getUserId(user);
  if (!(await hasProfile(userId)) || (await isEcoBanned(userId)).banned) {
    return;
  }

  if (!getEventsData()[type]) {
    throw new Error(`invalid event type: ${type}`);
  }

  const event = await getCurrentEvent();

  if (!event || event.type !== type) {
    if (
      [
        "blackjack",
        "mines",
        "highlow",
        "dragontower",
        "roulette",
        "slots",
        "rps",
        "coinflip",
        "chatreaction",
        "rob",
      ].includes(type)
    ) {
      return addEventProgress(client, user, "gamble", amount);
    }
    return;
  }

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

  let progress: number;

  if (!(await redis.exists(Constants.redis.cache.economy.eventProgress))) {
    progress = getEventProgress(await getCurrentEvent(false));
    await redis.set(Constants.redis.cache.economy.eventProgress, progress);
  } else {
    progress = await redis.incrby(Constants.redis.cache.economy.eventProgress, amount);
  }

  // keeps in sync - approximately every 20 times it'll update from db
  if (percentChance(5)) {
    progress = getEventProgress(await getCurrentEvent(false));
    await redis.set(Constants.redis.cache.economy.eventProgress, progress);
  }

  if (hasEventEnded(event, progress)) {
    completeEvent(client, userId);
  }

  return progress;
}

export function getEventProgress(event: EventData) {
  if (!event) {
    return 0;
  }

  return Number(event.contributions.reduce((acc, cur) => acc + cur.contribution, 0n));
}

async function giveRewards(event: EventData) {
  if (!event) return undefined;

  const top3 = event.contributions.slice(0, 3);
  const top5 = event.contributions.slice(0, 5);

  const achGroup = event.contributions.slice(0, Math.ceil(event.contributions.length * 0.025));
  const top5p = event.contributions.slice(0, Math.ceil(event.contributions.length * 0.05));
  const top10p = event.contributions.slice(0, Math.ceil(event.contributions.length * 0.1));
  const top50p = event.contributions.slice(0, Math.ceil(event.contributions.length * 0.5));
  const bottom50p = event.contributions.slice(top50p.length);

  logger.debug(`event: rewards`, { top1p: achGroup, top5p, top10p });

  for (const { userId } of achGroup) {
    if ((await isEcoBanned(userId)).banned) continue;
    await addProgress(userId, "event_pro", 1);
  }

  const givenRewards = new Map<string, { itemId: string; amount: number }[]>();

  if (!(await isEcoBanned(top5[0].userId)).banned) {
    givenRewards.set(top5[0].userId, [{ itemId: "pandora_box", amount: 3 }]);
    await addInventoryItem(top5[0].userId, "pandora_box", 3);
  }

  const giveRewardToGroup = async (group: EventContribution[], toGive: number, itemId: string) => {
    while (toGive > 0) {
      toGive--;
      const chosen = group[Math.floor(Math.random() * group.length)];

      if ((await isEcoBanned(chosen.userId)).banned) {
        logger.debug(`event: rewards: banned`, { userId: chosen.userId });
        toGive++;
        continue;
      }

      if (!givenRewards.has(chosen.userId)) {
        givenRewards.set(chosen.userId, []);
      }

      const rewards = givenRewards.get(chosen.userId);
      if (!rewards.find((i) => i.itemId === itemId)) {
        rewards.push({ itemId, amount: 1 });
      } else {
        rewards.find((i) => i.itemId === itemId).amount++;
      }

      await addInventoryItem(chosen.userId, itemId, 1);
    }
  };

  await giveRewardToGroup(top3, 300, "dabloon");
  await giveRewardToGroup(top5, 3, "pandora_box");
  await giveRewardToGroup(top5p, REWARDS_TOP5P, "pandora_box");
  await giveRewardToGroup(top10p, REWARDS_TOP10P, "pandora_box");
  await giveRewardToGroup(top50p, REWARDS_TOP50P, "pandora_box");
  await giveRewardToGroup(bottom50p, REWARDS_BOTTOM50P, "pandora_box");

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

async function completeEvent(client: NypsiClient, lastUser: string) {
  if (completing) {
    return;
  }

  completing = true;
  let event = await getCurrentEvent(false);

  if (hasEventCompleted(event)) {
    logger.error(`event: tried to complete event that was already completed: ${event.id}`);
    return;
  }

  event = await prisma.event.update({
    where: { id: event.id },
    data: {
      endedAt: new Date(),
    },
    include: {
      contributions: {
        orderBy: { contribution: "desc" },
      },
    },
  });

  await redis.del(Constants.redis.cache.economy.event, Constants.redis.cache.economy.eventProgress);

  completing = false;

  await giveRewards(event);
  const privacy = await getPreferences(lastUser).then((r) => r.leaderboards);

  let content = `🔱 the **${getEventsData()[event.type].name}** event has been completed!`;
  if (event.target) {
    content += ` completed in ${MStoTime(event.endedAt.getTime() - event.createdAt.getTime())}`;
  }

  content += "\n\n";

  if (privacy) {
    content += `the final contributing participant was **${await getLastKnownUsername(lastUser)}**\n\n`;
  }

  content += `<@&${Constants.EVENTS_ROLE_ID}>`;

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
      async (client, { content, channelId, components, cluster }) => {
        if ((client as unknown as NypsiClient).cluster.id != cluster) return;

        const channel = client.channels.cache.get(channelId);

        if (!channel) return;

        if (channel.isTextBased() && channel.isSendable()) {
          const msg = await channel.send({ content, components: [components] });
          msg.crosspost().catch(() => {});
        }
      },
      {
        context: {
          content,
          components: new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
            new ButtonBuilder()
              .setStyle(ButtonStyle.Link)
              .setLabel("leaderboard")
              .setEmoji("🏆")
              .setURL(`https://nypsi.xyz/events/${event.id}?ref=bot-event-announcement`),
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

/**
 * used for events that are supposed to be in progress
 */
function hasEventEnded(event: EventData, progress: number) {
  if (event.target) {
    return progress >= event.target;
  } else if (event.expiresAt) {
    return event.expiresAt.getTime() < Date.now();
  } else {
    throw new Error(`event: ${event.id} has neither target or expiresAt... BROKEN`);
  }
}

/**
 * used for events that are supposed to be completed / finished
 */
function hasEventCompleted(event: Event) {
  return Boolean(event.endedAt);
}

export function formatEventDescription(event: Event) {
  const data = getEventsData()[event.type];

  return data.description.replaceAll("{target}", event.target ? event.target.toLocaleString() : "");
}

export function formatEventProgress(event: EventData, progress: number, user?: MemberResolvable) {
  let message = `🔱 ${progress.toLocaleString()}`;

  if (event.target) {
    message += `/${event.target.toLocaleString()}`;
  }

  if (user) {
    const userId = getUserId(user);

    const contributionIndex = event.contributions.findIndex(
      (contribution) => contribution.userId === userId,
    );

    if (contributionIndex > -1) {
      message += ` (you are #${(contributionIndex + 1).toLocaleString()})`;
    }
  }

  if (event.expiresAt) {
    message += `\n-# ends <t:${Math.floor(event.expiresAt.getTime() / 1000)}:R>`;
  }

  return message;
}
