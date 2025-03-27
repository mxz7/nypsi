import { Guild } from "discord.js";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import Constants from "../../Constants";
import ms = require("ms");

export async function isAltPunish(guild: Guild) {
  if (await redis.exists(`${Constants.redis.cache.guild.ALT_PUNISH}:${guild.id}`)) {
    return (await redis.get(`${Constants.redis.cache.guild.ALT_PUNISH}:${guild.id}`)) === "t"
      ? true
      : false;
  }

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

  if (res) {
    await redis.set(
      `${Constants.redis.cache.guild.ALT_PUNISH}:${guild.id}`,
      "t",
      "EX",
      ms("24 hour") / 1000,
    );
  } else {
    await redis.set(
      `${Constants.redis.cache.guild.ALT_PUNISH}:${guild.id}`,
      "f",
      "EX",
      ms("24 hour") / 1000,
    );
  }

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

  await redis.del(`${Constants.redis.cache.guild.ALT_PUNISH}:${guild.id}`);
}
