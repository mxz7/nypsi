import { Guild } from "discord.js";
import prisma from "../../../init/database";
import { RedisCache } from "../../cache";
import Constants from "../../Constants";
import ms = require("ms");

const altPunishCache = new RedisCache<boolean>(
  Constants.redis.cache.guild.ALT_PUNISH,
  ms("24 hour") / 1000,
);

export async function isAltPunish(guild: Guild) {
  const cached = await altPunishCache.get(guild.id);
  if (cached !== null) return cached;

  const res = await prisma.guild
    .findUnique({
      where: {
        id: guild.id,
      },
      select: {
        alt_punish: true,
      },
    })
    .then((q) => q.alt_punish);

  await altPunishCache.set(guild.id, res);

  return res;
}

export async function setAltPunish(guild: Guild, bool: boolean) {
  await prisma.guild.update({
    where: {
      id: guild.id,
    },
    data: {
      alt_punish: bool,
    },
  });

  await altPunishCache.delete(guild.id);
}
