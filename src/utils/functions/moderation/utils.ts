import { Guild } from "discord.js";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import Constants from "../../Constants";
import ms = require("ms");

export async function createProfile(guild: Guild) {
  await prisma.moderation.create({
    data: {
      guildId: guild.id,
    },
  });
}

export async function profileExists(guild: Guild) {
  if (await redis.exists(`${Constants.redis.cache.moderation.EXISTS}:${guild.id}`)) return true;

  const query = await prisma.moderation.findUnique({
    where: {
      guildId: guild.id,
    },
    select: {
      guildId: true,
    },
  });

  if (!query) {
    return false;
  } else {
    await redis.set(`${Constants.redis.cache.moderation.EXISTS}:${guild.id}`, "t");
    await redis.expire(`${Constants.redis.cache.moderation.EXISTS}:${guild.id}`, Math.floor(ms("12 hours") / 1000));
    return true;
  }
}

export async function deleteServer(guild: Guild | string) {
  let id: string;
  if (guild instanceof Guild) {
    id = guild.id;
  } else {
    id = guild;
  }

  await prisma.moderationMute.deleteMany({
    where: {
      guildId: id,
    },
  });
  await prisma.moderationBan.deleteMany({
    where: {
      guildId: id,
    },
  });
  await prisma.moderationCase.deleteMany({
    where: {
      guildId: id,
    },
  });
  await prisma.moderation.delete({
    where: {
      guildId: id,
    },
  });
  await redis.del(`${Constants.redis.cache.moderation.EXISTS}:${id}`, "t");
}
