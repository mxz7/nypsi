import dayjs = require("dayjs");
import { Event, EventContribution } from "@prisma/client";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageActionRowComponentBuilder,
} from "discord.js";
import { inPlaceSort } from "fast-sort";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import { NypsiClient } from "../../../models/Client";
import { CustomEmbed } from "../../../models/EmbedBuilders";
import Constants from "../../Constants";
import { logger } from "../../logger";
import { MStoTime } from "../date";
import { getUserId, MemberResolvable } from "../member";
import { addNotificationToQueue, getPreferences } from "../users/notifications";
import { getLastKnownUsername } from "../users/tag";
import { hasProfile } from "../users/utils";
import { addProgress } from "./achievements";
import { addInventoryItem } from "./inventory";
import { getEventsData, getItems, isEcoBanned } from "./utils";
import ms = require("ms");

export type EventData = Event & { contributions: EventContribution[] };

let completing = false;

const REWARDS_TOP5P = 5;
const REWARDS_TOP10P = 4;
const REWARDS_TOP50P = 3;

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

  const event = await prisma.event.create({
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

  await redis.del(Constants.redis.cache.economy.event);

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
          content:
            `🔱 the **${getEventsData()[type].name}** event has started!!\n\n` +
            `> ${getEventsData()[type].description.replace("{target}", target.toLocaleString())}\n\n` +
            `ends on <t:${Math.floor(event.expiresAt.getTime() / 1000)}> (<t:${Math.floor(event.expiresAt.getTime() / 1000)}:R>)\n\n` +
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
              .setEmoji("🔱")
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

  checkEventExpire(client);

  return true;
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

  // keeps in sync
  if (progress % 1000 === 0) {
    await redis.set(
      Constants.redis.cache.economy.eventProgress,
      getEventProgress(await getCurrentEvent(false)),
    );
  }

  if (progress >= event.target) {
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

  const top5 = event.contributions.slice(0, 5);

  const achGroup = event.contributions.slice(0, Math.ceil(event.contributions.length * 0.025));
  const top5p = event.contributions.slice(0, Math.ceil(event.contributions.length * 0.05));
  const top10p = event.contributions.slice(0, Math.ceil(event.contributions.length * 0.1));
  const top50p = event.contributions.slice(0, Math.ceil(event.contributions.length * 0.5));

  logger.debug(`event: rewards`, { top1p: achGroup, top5p, top10p });

  for (const { userId } of achGroup) {
    if ((await isEcoBanned(userId)).banned) continue;
    await addProgress(userId, "event_pro", 1);
  }

  // userid -> amount
  const givenRewards = new Map<string, number>();

  if (!(await isEcoBanned(top5[0].userId)).banned) {
    givenRewards.set(top5[0].userId, 1);
    await addInventoryItem(top5[0].userId, "pandora_box", 1);
  }

  for (let i = 0; i < 2; i++) {
    const chosen = top5[Math.floor(Math.random() * top5.length)];

    if ((await isEcoBanned(chosen.userId)).banned) {
      logger.debug(`event: rewards: banned`, { userId: chosen.userId });
      i--;
      continue;
    }

    if (!givenRewards.has(chosen.userId)) {
      givenRewards.set(chosen.userId, 0);
    }

    givenRewards.set(chosen.userId, givenRewards.get(chosen.userId) + 1);
    await addInventoryItem(chosen.userId, "pandora_box", 1);
  }

  const giveRewardToGroup = async (group: EventContribution[], toGive: number) => {
    while (toGive > 0) {
      toGive--;
      const chosen = group[Math.floor(Math.random() * group.length)];

      if ((await isEcoBanned(chosen.userId)).banned) {
        logger.debug(`event: rewards: banned`, { userId: chosen.userId });
        toGive++;
        continue;
      }

      if (!givenRewards.has(chosen.userId)) {
        givenRewards.set(chosen.userId, 0);
      }

      givenRewards.set(chosen.userId, givenRewards.get(chosen.userId) + 1);
      await addInventoryItem(chosen.userId, "pandora_box", 1);
    }
  };

  await giveRewardToGroup(top5p, REWARDS_TOP5P);
  await giveRewardToGroup(top10p, REWARDS_TOP10P);
  await giveRewardToGroup(top50p, REWARDS_TOP50P);

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

export async function checkEventExpire(client: NypsiClient) {
  const event = await getCurrentEvent(false);

  if (!event) {
    return;
  }

  if (event.expiresAt.getTime() > Date.now() + ms("12 hours")) {
    setTimeout(() => {
      checkEventExpire(client);
    }, ms("10 hours"));

    return;
  }

  const doExpire = async (event: EventData) => {
    if (event.completed || event.expiresAt.getTime() < Date.now()) {
      return;
    }
    logger.info(`event: ${event.id} expired`);
    await redis.del(
      Constants.redis.cache.economy.event,
      Constants.redis.cache.economy.eventProgress,
    );

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
            const msg = await channel.send({ content });
            msg.crosspost().catch(() => {});
          }
        },
        {
          context: {
            content:
              `🔱 the **${getEventsData()[event.type].name}** event has come to an end without being completed **):**\n\n` +
              `${getEventProgress(event).toLocaleString()}/${event.target.toLocaleString()}\n\n` +
              `<@&${Constants.EVENTS_ROLE_ID}>`,
            channelId: targetChannel,
            cluster: cluster,
          },
        },
      )
      .then((res) => {
        return res.filter((i) => Boolean(i));
      });
  };

  setTimeout(async () => {
    const event = await getCurrentEvent(false);

    if (event) {
      doExpire(event);
    }
  }, event.expiresAt.getTime() - Date.now());
}

async function completeEvent(client: NypsiClient, lastUser: string) {
  if (completing) {
    return;
  }

  completing = true;
  let event = await getCurrentEvent(false);

  if (event.completed) {
    return;
  }

  event = await prisma.event.update({
    where: { id: event.id },
    data: {
      completed: true,
      completedAt: new Date(),
    },
    include: {
      contributions: {
        orderBy: { contribution: "desc" },
      },
    },
  });

  await redis.del(Constants.redis.cache.economy.event, Constants.redis.cache.economy.eventProgress);

  completing = false;

  const rewards = await giveRewards(event);
  const privacy = await getPreferences(lastUser).then((r) => r.leaderboards);

  let content =
    `🔱 the **${getEventsData()[event.type].name}** event has been completed! ` +
    `completed in ${MStoTime(event.completedAt.getTime() - event.createdAt.getTime())}\n\n`;

  if (privacy) {
    content += `the final contributing participant was **${await getLastKnownUsername(lastUser)}**\n\n`;
  }

  content += `**winning participants**\n`;

  for (const [userId, amount] of inPlaceSort(Array.from(rewards.entries())).desc((i) => i[1])) {
    let username: string;

    if ((await getPreferences(userId)).leaderboards) {
      username = `[${await getLastKnownUsername(userId, false)}](<https://nypsi.xyz/users/${userId}?ref=event-winners>)`;
    } else {
      username =
        "[[hidden]](<https://nypsi.xyz/docs/economy/user-settings/hidden?ref=event-winners>)";
    }

    content +=
      `**${amount}x** ${getItems()["pandora_box"].emoji} ${getItems()["pandora_box"].name} ` +
      `for **${username}**\n`;
  }

  content += `\n\n<@&${Constants.EVENTS_ROLE_ID}>`;

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
