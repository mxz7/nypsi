import prisma from "../../../init/database";
import { RedisCache } from "../../cache";
import Constants from "../../Constants";
import { getUserId, MemberResolvable } from "../member";

type EmbedColor = `#${string}` | "default";
const embedColorCache = new RedisCache<EmbedColor>(Constants.redis.cache.premium.COLOR, 3600);

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

  await embedColorCache.delete(userId);
}

export async function getEmbedColor(member: MemberResolvable): Promise<EmbedColor> {
  const userId = getUserId(member);

  const cached = await embedColorCache.get(userId);
  if (cached) return cached;

  const query = await prisma.premium.findFirst({
    where: {
      AND: [{ userId }, { level: { gt: 0 } }],
    },
    select: {
      embedColor: true,
    },
  });

  await embedColorCache.set(userId, (query?.embedColor as EmbedColor) || "default");

  return (query?.embedColor as EmbedColor) || "default";
}
