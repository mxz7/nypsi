import { Guild, TextChannel } from "discord.js";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import { NypsiClient } from "../../../models/Client";
import Constants from "../../Constants";
import { logger } from "../../logger";
import { startOpenChatReaction } from "./game";
import ms = require("ms");

const lastGame = new Map<string, number>();

export function doChatReactions(client: NypsiClient) {
  setInterval(async () => {
    let count = 0;

    const query = await prisma.chatReaction.findMany({
      where: {
        AND: [{ guildId: { in: Array.from(client.guilds.cache.keys()) } }, { randomStart: true }],
      },
      select: {
        guildId: true,
        randomChannels: true,
        randomModifier: true,
        betweenEvents: true,
      },
    });

    for (const guildData of query) {
      if (!guildData) continue;

      const guild = client.guilds.cache.get(guildData.guildId);

      if (!guild) continue;

      const channels = guildData.randomChannels;

      if (channels.length == 0) continue;

      const now = new Date().getTime();

      for (const ch of channels) {
        if (lastGame.has(ch)) {
          if (now >= lastGame.get(ch)) {
            lastGame.delete(ch);
          } else {
            continue;
          }
        }

        const channel = guild.channels.cache.get(ch);

        if (!channel) {
          continue;
        }

        if (!channel.isTextBased()) return;

        const messages = await channel.messages.fetch({ limit: 50 }).catch(() => {});
        let stop = false;

        if (!messages) continue;

        messages.forEach((m) => {
          if (m.author.id == guild.client.user.id) {
            if (!m.embeds[0]) return;
            if (!m.embeds[0].author) return;
            if (m.embeds[0].author.name == "chat reaction") {
              stop = true;
              return;
            }
          }
        });

        if (stop) {
          continue;
        }

        logger.debug(`chat reaction randomly started in ${channel.id}`);
        startOpenChatReaction(guild, channel as TextChannel, false).catch(() => {});
        count++;

        const base = guildData.betweenEvents;
        let final;

        if (guildData.randomModifier == 0) {
          final = base;
        } else {
          const o = ["+", "-"];
          let operator = o[Math.floor(Math.random() * o.length)];

          if (base - guildData.randomModifier < 120) {
            operator = "+";
          }

          const amount = Math.floor(Math.random() * guildData.randomModifier);

          if (operator == "+") {
            final = base + amount;
          } else {
            final = base - amount;
          }
        }

        const nextGame = new Date().getTime() + final * 1000;

        lastGame.set(channel.id, nextGame);

        continue;
      }
    }

    if (count > 0) {
      logger.info(`::auto ${count} chat reaction${count > 1 ? "s" : ""} started`);
    }
  }, ms("5m"));
}

export async function createReactionProfile(guild: Guild) {
  await prisma.chatReaction.create({
    data: {
      guildId: guild.id,
    },
  });

  await redis.set(
    `${Constants.redis.cache.chatReaction.EXISTS}:${guild.id}`,
    "t",
    "EX",
    ms("12 hours") / 1000,
  );
}

export async function hasReactionProfile(guild: Guild) {
  if (await redis.exists(`${Constants.redis.cache.chatReaction.EXISTS}:${guild.id}`)) return true;
  const query = await prisma.chatReaction.findUnique({
    where: {
      guildId: guild.id,
    },
    select: {
      guildId: true,
    },
  });

  if (query) {
    await redis.set(
      `${Constants.redis.cache.chatReaction.EXISTS}:${guild.id}`,
      "t",
      "EX",
      ms("12 hours") / 1000,
    );

    return true;
  } else {
    return false;
  }
}

export async function getReactionSettings(guild: Guild) {
  const query = await prisma.chatReaction.findUnique({
    where: {
      guildId: guild.id,
    },
    select: {
      randomStart: true,
      randomChannels: true,
      betweenEvents: true,
      randomModifier: true,
      timeout: true,
    },
  });

  return query;
}

export async function updateReactionSettings(
  guild: Guild,
  settings: {
    randomStart: boolean;
    randomChannels: string[];
    betweenEvents: number;
    randomModifier: number;
    timeout: number;
  },
) {
  await prisma.chatReaction.update({
    where: {
      guildId: guild.id,
    },
    data: {
      randomStart: settings.randomStart,
      randomChannels: settings.randomChannels,
      randomModifier: settings.randomModifier,
      betweenEvents: settings.betweenEvents,
      timeout: settings.timeout,
    },
  });
}
