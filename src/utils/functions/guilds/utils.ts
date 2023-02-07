import { Guild } from "discord.js";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import { SnipedMessage } from "../../../types/Snipe";
import Constants from "../../Constants";
import { logger } from "../../logger/logger";
import ms = require("ms");

const snipe: Map<string, SnipedMessage> = new Map();
const eSnipe: Map<string, SnipedMessage> = new Map();

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

const fetchCooldown = new Set<string>();

export async function runCheck(guild: Guild) {
  if (!(await hasGuild(guild))) await createGuild(guild);

  const query = await prisma.guild.findUnique({
    where: {
      id: guild.id,
    },
    select: {
      peak: true,
    },
  });

  if (!query) {
    return;
  }

  const currentMembersPeak = query.peak;

  if (guild.memberCount > currentMembersPeak) {
    await prisma.guild.update({
      where: {
        id: guild.id,
      },
      data: {
        peak: guild.memberCount,
      },
    });
  }
}

export async function hasGuild(guild: Guild): Promise<boolean> {
  if (await redis.exists(`${Constants.redis.cache.guild.EXISTS}:${guild.id}`)) return true;
  const query = await prisma.guild.findUnique({
    where: {
      id: guild.id,
    },
    select: {
      id: true,
    },
  });

  if (query) {
    await redis.set(`${Constants.redis.cache.guild.EXISTS}:${guild.id}`, "1");
    await redis.expire(`${Constants.redis.cache.guild.EXISTS}:${guild.id}`, Math.floor(ms("24 hour") / 1000));
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

export async function createGuild(guild: Guild) {
  await prisma.guild.create({
    data: {
      id: guild.id,
    },
  });

  await redis.set(`${Constants.redis.cache.guild.EXISTS}:${guild.id}`, 1);
  await redis.expire(`${Constants.redis.cache.guild.EXISTS}:${guild.id}`, Math.floor(ms("24 hour") / 1000));
}

export function addCooldown(guild: Guild, seconds: number) {
  fetchCooldown.add(guild.id);

  setTimeout(() => {
    fetchCooldown.delete(guild.id);
  }, seconds * 1000);
}

export function inCooldown(guild: Guild): boolean {
  if (fetchCooldown.has(guild.id)) {
    return true;
  } else {
    return false;
  }
}

export async function getPrefix(guild: Guild): Promise<string> {
  try {
    if (await redis.exists(`${Constants.redis.cache.guild.PREFIX}:${guild.id}`)) {
      return redis.get(`${Constants.redis.cache.guild.PREFIX}:${guild.id}`);
    }

    const query = await prisma.guild.findUnique({
      where: {
        id: guild.id,
      },
      select: {
        prefix: true,
      },
    });

    if (query.prefix == "") {
      query.prefix = "$";
      await prisma.guild.update({
        where: {
          id: guild.id,
        },
        data: {
          prefix: "$",
        },
      });
    }

    await redis.set(`${Constants.redis.cache.guild.PREFIX}:${guild.id}`, query.prefix);
    await redis.expire(`${Constants.redis.cache.guild.PREFIX}:${guild.id}`, 3600);

    return query.prefix;
  } catch (e) {
    if (!(await hasGuild(guild))) await createGuild(guild);
    logger.warn("couldn't fetch prefix for server " + guild.id);
    return "$";
  }
}

export async function setPrefix(guild: Guild, prefix: string) {
  await prisma.guild.update({
    where: {
      id: guild.id,
    },
    data: {
      prefix: prefix,
    },
  });

  await redis.del(`${Constants.redis.cache.guild.PREFIX}:${guild.id}`);
}

export async function getPercentMatch(guild: Guild | string) {
  let guildID: string;

  if (guild instanceof Guild) {
    guildID = guild.id;
  } else {
    guildID = guild;
  }

  if (await redis.exists(`${Constants.redis.cache.guild.PERCENT_MATCH}:${guildID}`)) {
    return parseInt(await redis.get(`${Constants.redis.cache.guild.PERCENT_MATCH}:${guildID}`));
  }

  const query = await prisma.guild.findUnique({
    where: {
      id: guildID,
    },
    select: {
      percentMatch: true,
    },
  });

  await redis.set(`${Constants.redis.cache.guild.PERCENT_MATCH}:${guildID}`, query.percentMatch);
  await redis.expire(`${Constants.redis.cache.guild.PERCENT_MATCH}:${guildID}`, 3600);

  return query.percentMatch;
}

export async function setPercentMatch(guild: Guild | string, num: number) {
  let guildID: string;

  if (guild instanceof Guild) {
    guildID = guild.id;
  } else {
    guildID = guild;
  }

  await prisma.guild.update({
    where: {
      id: guildID,
    },
    data: {
      percentMatch: num,
    },
  });

  await redis.del(`${Constants.redis.cache.guild.PERCENT_MATCH}:${guildID}`);
}
