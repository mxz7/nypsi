import { ProfileViewSource } from "#generated/prisma";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import Constants from "../../Constants";
import { logger } from "../../logger";
import { getUserId, MemberResolvable } from "../member";
import ms = require("ms");
import dayjs = require("dayjs");

export async function getViews(member: MemberResolvable, limit?: Date) {
  const userId = getUserId(member);

  const cache = await redis.get(`${Constants.redis.cache.user.views}:${userId}`);

  if (cache)
    return JSON.parse(cache) as {
      createdAt: Date;
      source: ProfileViewSource;
      viewerId: string;
      referrer: string;
    }[];

  const query = await prisma.profileView.findMany({
    where: { AND: [{ userId }, { createdAt: { gt: limit || new Date(0) } }] },
    select: {
      createdAt: true,
      referrer: true,
      source: true,
      viewerId: true,
    },
    orderBy: { id: "desc" },
  });

  await redis.set(
    `${Constants.redis.cache.user.views}:${userId}`,
    JSON.stringify(query),
    "EX",
    ms("1 hour"),
  );

  return query;
}

export async function addView(member: MemberResolvable, viewer: MemberResolvable, source: string) {
  const userId = getUserId(member);
  const viewerId = getUserId(viewer);

  if (userId === viewerId) return;
  const views = await getViews(userId, dayjs().subtract(5, "minute").toDate());

  for (const view of views) {
    if (view.viewerId === viewerId) return;
    try {
      if (new Date(view.createdAt).getTime() >= dayjs().subtract(10, "second").toDate().getTime())
        return;
    } catch {
      logger.debug(`weird view no time think`, views);
    }
  }

  await prisma.profileView
    .create({
      data: {
        source: "BOT",
        userId: userId,
        viewerId: viewerId,
        referrer: source,
      },
    })
    .catch(() => {});

  redis.del(`${Constants.redis.cache.user.views}:${userId}`);
}
