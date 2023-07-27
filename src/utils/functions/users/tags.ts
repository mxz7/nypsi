import prisma from "../../../init/database";
import redis from "../../../init/redis";
import Constants from "../../Constants";
import { logger } from "../../logger";
import { getTagsData } from "../economy/utils";

export async function getTags(userId: string) {
  const cache = await redis.get(`${Constants.redis.cache.user.tags}:${userId}`);

  if (cache) {
    return JSON.parse(cache) as {
      userId: string;
      tagId: string;
      selected: boolean;
      created: Date;
    }[];
  }

  const query = await prisma.tags.findMany({
    where: { userId },
  });

  await redis.set(
    `${Constants.redis.cache.user.tags}:${userId}`,
    JSON.stringify(query),
    "EX",
    3600 * 2,
  );

  return query;
}

export async function addTag(userId: string, tagId: string) {
  const tags = getTagsData();

  if (!tags[tagId]) {
    logger.warn("attempted to add invalid tag", { userId, tagId });
    return getTags(userId);
  }

  await redis.del(`${Constants.redis.cache.user.tags}:${userId}`);

  await prisma.tags.create({
    data: {
      userId,
      tagId,
    },
  });

  return getTags(userId);
}
