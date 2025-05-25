import { Guild } from "discord.js";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import { SnipedMessage } from "../../../types/Snipe";
import Constants from "../../Constants";
import { logger } from "../../logger";
import ms = require("ms");

const snipe: Map<string, SnipedMessage> = new Map();
const eSnipe: Map<string, SnipedMessage> = new Map();
const peaks = new Map<string, number>();

export { eSnipe, snipe };

export function runSnipeClearIntervals() {
  setInterval(() => {
    const now = new Date().getTime();

    let snipeCount = 0;
    let eSnipeCount = 0;

    snipe.forEach((msg) => {
      const diff = now - msg.createdTimestamp;

      if (diff >= 43200000) {
        snipe.delete(msg.channel.id);
        snipeCount++;
      }
    });

    if (snipeCount > 0) {
      logger.info("::auto deleted " + snipeCount.toLocaleString() + " sniped messages");
    }

    eSnipe.forEach((msg) => {
      const diff = now - msg.createdTimestamp;

      if (diff >= 43200000) {
        eSnipe.delete(msg.channel.id);
        eSnipeCount++;
      }
    });

    if (eSnipeCount > 0) {
      logger.info("::auto deleted " + eSnipeCount.toLocaleString() + " edit sniped messages");
    }
  }, 3600000);
}

export async function updateGuildPeak(guild: Guild) {
  if (!(await hasGuild(guild))) await createGuild(guild);

  const peak = await getPeaks(guild);

  if (guild.memberCount > peak) {
    await prisma.guild.update({
      where: {
        id: guild.id,
      },
      data: {
        peak: guild.memberCount,
      },
    });
    peaks.set(guild.id, guild.memberCount);
  }
}

export async function hasGuild(guild: Guild | string): Promise<boolean> {
  let guildId: string;

  if (guild instanceof Guild) {
    guildId = guild.id;
  } else {
    guildId = guild;
  }

  if (await redis.exists(`${Constants.redis.cache.guild.EXISTS}:${guildId}`)) return true;
  const query = await prisma.guild.findUnique({
    where: {
      id: guildId,
    },
    select: {
      id: true,
    },
  });

  if (query) {
    await redis.set(
      `${Constants.redis.cache.guild.EXISTS}:${guildId}`,
      "1",
      "EX",
      ms("24 hour") / 1000,
    );
    return true;
  } else {
    return false;
  }
}

export async function getPeaks(guild: Guild) {
  const query = await prisma.guild.findUnique({
    where: {
      id: guild.id,
    },
    select: {
      peak: true,
    },
  });

  return query.peak;
}

export async function createGuild(guild: Guild | string) {
  let guildId: string;
  let isDev = false;

  if (guild instanceof Guild) {
    guildId = guild.id;

    if (guild.client.user.id !== Constants.BOT_USER_ID) isDev = true;
  } else {
    guildId = guild;
  }

  await prisma.guild.create({
    data: {
      id: guildId,
      prefixes: isDev ? ["£"] : undefined,
      peak: guild instanceof Guild ? guild.memberCount : 0,
    },
  });

  peaks.set(guildId, guild instanceof Guild ? guild.memberCount : 0);

  await redis.set(
    `${Constants.redis.cache.guild.EXISTS}:${guildId}`,
    1,
    "EX",
    ms("24 hour") / 1000,
  );
}

export async function getPrefix(guild: Guild | string): Promise<string[]> {
  let guildId: string;

  if (guild instanceof Guild) {
    guildId = guild.id;
  } else {
    guildId = guild;
  }

  try {
    if (await redis.exists(`${Constants.redis.cache.guild.PREFIX}:${guildId}`)) {
      return (await redis.get(`${Constants.redis.cache.guild.PREFIX}:${guildId}`)).split(" ");
    }

    const query = await prisma.guild.findUnique({
      where: {
        id: guildId,
      },
      select: {
        prefixes: true,
      },
    });

    if (query.prefixes.length === 0) {
      query.prefixes = ["$"];
      await prisma.guild.update({
        where: {
          id: guildId,
        },
        data: {
          prefixes: ["$"],
        },
      });
    }

    await redis.set(
      `${Constants.redis.cache.guild.PREFIX}:${guildId}`,
      query.prefixes.join(" "),
      "EX",
      ms("24 hour") / 1000,
    );

    return query.prefixes;
  } catch (e) {
    if (!(await hasGuild(guild))) await createGuild(guild);
    logger.warn("couldn't fetch prefix for server " + guildId);
    return ["$"];
  }
}

export async function setPrefix(guild: Guild, prefix: string[]) {
  await prisma.guild.update({
    where: {
      id: guild.id,
    },
    data: {
      prefixes: prefix,
    },
  });

  await redis.del(`${Constants.redis.cache.guild.PREFIX}:${guild.id}`);
}
