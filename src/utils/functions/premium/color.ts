import { GuildMember } from "discord.js";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import Constants from "../../Constants";

export async function setEmbedColor(member: GuildMember | string, color: string) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  await prisma.premium.update({
    where: {
      userId: id,
    },
    data: {
      embedColor: color,
    },
  });

  await redis.del(`${Constants.redis.cache.premium.COLOR}:${id}`);
}

export async function getEmbedColor(member: string): Promise<`#${string}` | "default"> {
  const cache = await redis.get(`${Constants.redis.cache.premium.COLOR}:${member}`);

  if (cache) return cache as `#${string}` | "default";

  const query = await prisma.premium.findFirst({
    where: {
      AND: [{ userId: member }, { level: { gt: 0 } }],
    },
    select: {
      embedColor: true,
    },
  });

  await redis.set(
    `${Constants.redis.cache.premium.COLOR}:${member}`,
    query?.embedColor || "default",
    "EX",
    3600,
  );

  return (query?.embedColor as `#${string}` | "default") || "default";
}
