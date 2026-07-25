import prisma from "../../../init/database";
import { RedisCache } from "../../cache";
import Constants from "../../Constants";
import { getUserId, MemberResolvable } from "../member";
import { userExists } from "./utils";
const passiveCache = new RedisCache<boolean>(Constants.redis.cache.economy.PASSIVE, 24 * 60 * 60);

export async function isPassive(member: MemberResolvable) {
  if (!(await userExists(member))) return false;

  const userId = getUserId(member);

  const cache = await passiveCache.get(userId);

  if (cache !== null) return cache;

  const query = await prisma.economy.findUnique({
    where: {
      userId,
    },
    select: {
      passive: true,
    },
  });

  await passiveCache.set(userId, query.passive);

  return query.passive;
}

export async function setPassive(member: MemberResolvable, value: boolean) {
  const userId = getUserId(member);

  await prisma.economy.update({
    where: {
      userId,
    },
    data: {
      passive: value,
    },
  });

  await passiveCache.delete(userId);
}
