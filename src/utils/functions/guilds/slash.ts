import { Guild } from "discord.js";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import ms = require("ms");
import Constants from "../../Constants";

export async function isSlashOnly(guild: Guild) {
  if (await redis.exists(`${Constants.redis.cache.guild.SLASH_ONLY}:${guild.id}`)) {
    return (await redis.get(`${Constants.redis.cache.guild.SLASH_ONLY}:${guild.id}`)) === "t" ? true : false;
  }

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

  if (res) {
    await redis.set(`${Constants.redis.cache.guild.SLASH_ONLY}:${guild.id}`, "t");
    await redis.expire(`${Constants.redis.cache.guild.SLASH_ONLY}:${guild.id}`, ms("3 hours") / 1000);
  } else {
    await redis.set(`${Constants.redis.cache.guild.SLASH_ONLY}:${guild.id}`, "f");
    await redis.expire(`${Constants.redis.cache.guild.SLASH_ONLY}:${guild.id}`, ms("3 hours") / 1000);
  }

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

  await redis.del(`${Constants.redis.cache.guild.SLASH_ONLY}:${guild.id}`);
}
