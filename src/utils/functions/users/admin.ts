import ms = require("ms");
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import Constants from "../../Constants";
import { GuildMember } from "discord.js";

export async function getAdminLevel(member: GuildMember | string) {
  let userId: string;
  if (member instanceof GuildMember) {
    userId = member.user.id;
  } else {
    userId = member;
  }

  if (await redis.exists(`${Constants.redis.cache.user.ADMIN_LEVEL}:${userId}`)) {
    return parseInt(await redis.get(`${Constants.redis.cache.user.ADMIN_LEVEL}:${userId}`));
  }

  let query = await prisma.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      adminLevel: true,
    },
  });

  if (!query) {
    query = {
      adminLevel: 0,
    };
  }

  await redis.set(
    `${Constants.redis.cache.user.ADMIN_LEVEL}:${userId}`,
    query.adminLevel,
    "EX",
    Math.floor(ms("3 hours") / 1000),
  );

  return query.adminLevel;
}

export async function setAdminLevel(userId: string, level: number) {
  await redis.del(`${Constants.redis.cache.user.ADMIN_LEVEL}:${userId}`);
  await prisma.user.update({
    where: {
      id: userId,
    },
    data: {
      adminLevel: level,
    },
  });
}
