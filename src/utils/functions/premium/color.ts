import prisma from "../../../init/database";
import redis from "../../../init/redis";
import Constants from "../../Constants";
import { getUserId, MemberResolvable } from "../member";

export async function setEmbedColor(member: MemberResolvable, color: string) {
  const userId = getUserId(member);

  await prisma.premium.update({
    where: {
      userId,
    },
    data: {
      embedColor: color,
    },
  });

  await redis.del(`${Constants.redis.cache.premium.COLOR}:${userId}`);
}

export async function getEmbedColor(member: MemberResolvable): Promise<`#${string}` | "default"> {
  const userId = getUserId(member);

  const cache = await redis.get(`${Constants.redis.cache.premium.COLOR}:${userId}`);

  if (cache) return cache as `#${string}` | "default";

  const query = await prisma.premium.findFirst({
    where: {
      AND: [{ userId }, { level: { gt: 0 } }],
    },
    select: {
      embedColor: true,
    },
  });

  await redis.set(
    `${Constants.redis.cache.premium.COLOR}:${userId}`,
    query?.embedColor || "default",
    "EX",
    3600,
  );

  return (query?.embedColor as `#${string}` | "default") || "default";
}
