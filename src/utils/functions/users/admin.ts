import ms = require("ms");
import prisma from "../../../init/database";
import { RedisCache } from "../../cache";
import Constants, { AdminPermission } from "../../Constants";
import { getUserId, MemberResolvable } from "../member";

const adminLevelCache = new RedisCache<number>(
  Constants.redis.cache.user.ADMIN_LEVEL,
  Math.floor(ms("3 hours") / 1000),
);

export async function hasAdminPermission(member: MemberResolvable, permission: AdminPermission) {
  return (await getAdminLevel(member)) >= Constants.ADMIN_PERMISSIONS.get(permission);
}

export async function getAdminLevel(member: MemberResolvable) {
  const userId = getUserId(member);

  const cached = await adminLevelCache.get(userId);
  if (cached !== null) return cached;

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

  await adminLevelCache.set(userId, query.adminLevel);

  return query.adminLevel;
}

export async function setAdminLevel(member: MemberResolvable, level: number) {
  const userId = getUserId(member);

  await adminLevelCache.delete(userId);
  await prisma.user.update({
    where: {
      id: userId,
    },
    data: {
      adminLevel: level,
    },
  });
}
