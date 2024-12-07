import { Guild } from "discord.js";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import Constants from "../../Constants";
import ms = require("ms");

export async function addAlt(guild: Guild, mainId: string, altId: string) {
  try {
    await prisma.alt.create({
      data: {
        guildId: guild.id,
        mainId: mainId,
        altId: altId,
      },
    });
  } catch {
    return false;
  }

  await redis.del(`${Constants.redis.cache.guild.ALTS}:${guild.id}:${mainId}`);

  const alts = await getAlts(guild, mainId);

  for (const alt of alts)
    await redis.del(
      `${Constants.redis.cache.guild.ALTS}:${guild.id}:${alt}`,
      `${Constants.redis.cache.economy.BANNED}:${alt}`,
    );

  return true;
}

export async function deleteAlt(guild: Guild, altId: string) {
  const alts = await getAllGroupAccountIds(guild, altId);

  await prisma.alt.deleteMany({
    where: {
      AND: [{ guildId: guild.id }, { altId: altId }],
    },
  });

  for (const alt of alts) await redis.del(`${Constants.redis.cache.guild.ALTS}:${guild.id}:${alt}`);
}

export async function getAlts(guild: Guild | string, mainId: string) {
  let id: string;

  if (guild instanceof Guild) id = guild.id;
  else id = guild;

  const cache = await redis.get(`${Constants.redis.cache.guild.ALTS}:${id}:${mainId}`);

  if (cache) return (JSON.parse(cache) as { mainId: string; altId: string }[]).map((i) => i.altId);

  const query = await prisma.alt.findMany({
    where: {
      AND: [{ guildId: id }, { mainId: mainId }],
    },
  });

  for (const alt of [mainId, ...query.map((i) => i.altId)])
    await redis.set(
      `${Constants.redis.cache.guild.ALTS}:${id}:${alt}}`,
      JSON.stringify({ altId: alt, mainId }),
      "EX",
      ms("6 hour") / 1000,
    );

  return query.map((i) => i.altId);
}

export async function getAllGroupAccountIds(guild: Guild | string, userId: string) {
  let id: string;

  if (guild instanceof Guild) id = guild.id;
  else id = guild;

  const cache = await redis.get(`${Constants.redis.cache.guild.ALTS}:${id}:${userId}`);

  if (cache) {
    const parsed = JSON.parse(cache) as { mainId: string; altId: string }[];

    if (parsed.length === 0) return [userId];
    return [parsed[0].mainId, ...parsed.map((i) => i.altId)];
  }

  const mainId = (await isMainAccount(guild, userId))
    ? userId
    : await getMainAccountId(guild, userId);

  if (!mainId) {
    await redis.set(
      `${Constants.redis.cache.guild.ALTS}:${id}:${userId}`,
      JSON.stringify([]),
      "EX",
      ms("24 hours"),
    );
    return [userId];
  }

  const alts = await getAlts(id, mainId);

  return [mainId, ...alts];
}

export async function isAlt(guild: Guild, altId: string) {
  const query = await prisma.alt.findFirst({
    where: {
      AND: [{ guildId: guild.id }, { altId: altId }],
    },
  });

  return query ? true : false;
}

export async function getMainAccountId(guild: Guild | string, altId: string) {
  let id: string;

  if (guild instanceof Guild) id = guild.id;
  else id = guild;

  const cache = await redis.get(`${Constants.redis.cache.guild.ALTS}:${id}:${altId}`);

  if (cache) {
    let mainId: string;
    try {
      mainId = (JSON.parse(cache) as { mainId: string; altId: string }[])[0]?.mainId;
    } catch {
      mainId = null;
    }

    if (mainId) return mainId;
  }

  const query = await prisma.alt.findFirst({
    where: {
      AND: [{ guildId: id }, { altId: altId }],
    },
    select: {
      mainId: true,
    },
  });

  return query?.mainId || null;
}

export async function isMainAccount(guild: Guild | string, userId: string) {
  let id: string;

  if (guild instanceof Guild) id = guild.id;
  else id = guild;

  const cache = await redis.get(`${Constants.redis.cache.guild.ALTS}:${id}:${userId}`);

  if (cache) {
    const parsed = JSON.parse(cache) as { mainId: string; altId: string }[];

    if (parsed.length > 0) {
      if (parsed[0]?.mainId === userId) return true;
      else return false;
    }
  }

  const query = await prisma.alt.findFirst({
    where: {
      AND: [{ guildId: id }, { mainId: userId }],
    },
  });

  return Boolean(query);
}
