import { Guild } from "discord.js";
import prisma from "../../../init/database";
import { RedisCache } from "../../cache";
import Constants from "../../Constants";

const slashOnlyCache = new RedisCache<boolean>(Constants.redis.cache.guild.SLASH_ONLY, 86400);

export async function isSlashOnly(guild: Guild) {
  const cached = await slashOnlyCache.get(guild.id);

  if (cached !== null) return cached;

  const res = await prisma.guild
    .findUnique({
      where: {
        id: guild.id,
      },
      select: {
        slash_only: true,
      },
    })
    .then((q) => q.slash_only);

  await slashOnlyCache.set(guild.id, res);

  return res;
}

export async function setSlashOnly(guild: Guild, bool: boolean) {
  await prisma.guild.update({
    where: {
      id: guild.id,
    },
    data: {
      slash_only: bool,
    },
  });

  await slashOnlyCache.set(guild.id, bool);
}
