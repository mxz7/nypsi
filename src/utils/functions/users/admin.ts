import ms = require("ms");
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import Constants from "../../Constants";
import { getUserId, MemberResolvable } from "../member";

export async function getAdminLevel(member: MemberResolvable) {
  const userId = getUserId(member);

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

export async function setAdminLevel(member: MemberResolvable, level: number) {
  const userId = getUserId(member);

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
