import prisma from "../../../init/database";
import redis from "../../../init/redis";
import Constants from "../../Constants";
import { logger } from "../../logger";
import { getTagsData } from "../economy/utils";
import { getUserId, MemberResolvable } from "../member";

export async function getTags(member: MemberResolvable) {
  const userId = getUserId(member);

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
    604800,
  );

  return query;
}

export async function removeTag(member: MemberResolvable, tagId: string) {
  const userId = getUserId(member);

  await redis.del(`${Constants.redis.cache.user.tags}:${userId}`);

  await prisma.tags.delete({
    where: {
      userId_tagId: {
        userId,
        tagId,
      },
    },
  });

  return getTags(userId);
}

export async function addTag(member: MemberResolvable, tagId: string) {
  const userId = getUserId(member);

  const tags = getTagsData();

  if (!tags[tagId]) {
    logger.warn("attempted to add invalid tag", { userId, tagId });
    return getTags(userId);
  }

  await redis.del(
    `${Constants.redis.cache.user.tags}:${userId}`,
    `${Constants.redis.cache.user.tagCount}:${tagId}`,
  );

  await prisma.tags.create({
    data: {
      userId,
      tagId,
    },
  });

  return getTags(userId);
}

export async function setActiveTag(member: MemberResolvable, tagId: string) {
  const userId = getUserId(member);

  await redis.del(`${Constants.redis.cache.user.tags}:${userId}`);

  await prisma.tags.updateMany({
    where: { userId },
    data: {
      selected: false,
    },
  });

  if (tagId != "none")
    await prisma.tags.update({
      where: {
        userId_tagId: {
          userId,
          tagId,
        },
      },
      data: {
        selected: true,
      },
    });

  return getTags(userId);
}

export async function getActiveTag(member: MemberResolvable) {
  const tags = await getTags(member);

  return tags.find((i) => i.selected);
}

export async function getTagCount(tagId: string) {
  const cache = await redis.get(`${Constants.redis.cache.user.tagCount}:${tagId}`);

  if (cache) return parseInt(cache);

  const query = await prisma.tags.count({ where: { tagId } });

  await redis.set(`${Constants.redis.cache.user.tagCount}:${tagId}`, query, "EX", 84000);

  return query;
}
