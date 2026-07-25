import { ProfileViewSource } from "#generated/prisma";
import prisma from "../../../init/database";
import { RedisCache } from "../../cache";
import Constants from "../../Constants";
import { logger } from "../../logger";
import { getUserId, MemberResolvable } from "../member";
import ms = require("ms");
import dayjs = require("dayjs");

type CachedView = {
  createdAt: Date;
  source: ProfileViewSource;
  viewerId: string;
  referrer: string;
};

const viewsCache = new RedisCache<CachedView[]>(
  Constants.redis.cache.user.views,
  ms("1 hour") / 1000,
);

export async function getViews(member: MemberResolvable, limit?: Date) {
  const userId = getUserId(member);

  const cached = await viewsCache.get(userId);
  if (cached) return cached;

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

  await viewsCache.set(userId, query);

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

  viewsCache.delete(userId);
}
