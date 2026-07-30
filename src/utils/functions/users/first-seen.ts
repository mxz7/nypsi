import {
  MessageSearchSortMode,
  RESTGetAPIGuildMessagesSearchResult,
  Routes,
} from "discord-api-types/v10";
import { GuildMember } from "discord.js";
import prisma from "../../../init/database";
import { RedisCache } from "../../cache";
import Constants from "../../Constants";
import { logger } from "../../logger";
import { getUserId, MemberResolvable } from "../member";
import sleep from "../sleep";
import ms = require("ms");

const firstSeenCache = new RedisCache<number | false>(
  Constants.redis.cache.user.FIRST_SEEN,
  Math.floor(ms("7 days") / 1000),
);

export async function getFirstSeen(member: MemberResolvable) {
  const userId = getUserId(member);

  const cached = await firstSeenCache.get(userId);
  if (cached !== null) return cached === false ? undefined : new Date(cached);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { firstSeen: true },
  });

  await firstSeenCache.set(userId, user?.firstSeen?.getTime() ?? false);

  return user?.firstSeen;
}

export async function setFirstSeen(member: MemberResolvable, firstSeen: Date) {
  const userId = getUserId(member);
  const result = await prisma.user.updateMany({
    where: { id: userId, firstSeen: null },
    data: { firstSeen },
  });

  if (result.count > 0) {
    await firstSeenCache.set(userId, firstSeen.getTime());
  } else {
    await firstSeenCache.delete(userId);
  }

  return result;
}

export async function fetchFirstSeen(member: GuildMember) {
  const storedFirstSeen = await getFirstSeen(member);
  if (storedFirstSeen) return storedFirstSeen;

  try {
    const query = new URLSearchParams({
      author_id: member.id,
      include_nsfw: "true",
      limit: "1",
      sort_by: MessageSearchSortMode.Timestamp,
      sort_order: "asc",
    });
    const search = () =>
      member.client.rest.get(Routes.guildMessagesSearch(member.guild.id), {
        query,
      }) as Promise<RESTGetAPIGuildMessagesSearchResult>;
    let result = await search();

    if (!("messages" in result)) {
      await sleep(Math.max(result.retry_after * 1000, 1000));
      result = await search();
    }

    if (!("messages" in result)) return;

    const firstMessage = result.messages.flat().find((message) => message.author.id === member.id);
    if (!firstMessage) return;

    const firstSeen = new Date(firstMessage.timestamp);

    await setFirstSeen(member, firstSeen);

    return firstSeen;
  } catch (error) {
    logger.warn("users: failed to fetch first seen date", { userId: member.id, error });
  }
}
