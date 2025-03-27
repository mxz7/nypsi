import { GuildMember } from "discord.js";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import Constants from "../../Constants";
import { createProfile } from "../users/utils";

export async function getKarma(member: GuildMember | string): Promise<number> {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  if (await redis.exists(`${Constants.redis.cache.user.KARMA}:${id}`))
    return parseInt(await redis.get(`${Constants.redis.cache.user.KARMA}:${id}`));

  const query = await prisma.user.findUnique({
    where: {
      id: id,
    },
    select: {
      karma: true,
    },
  });

  if (!query) {
    if (member instanceof GuildMember) {
      await createProfile(member.user);
    } else {
      await createProfile(id);
    }
    return 1;
  } else {
    await redis.set(`${Constants.redis.cache.user.KARMA}:${id}`, query.karma, "EX", 86400);
    return query.karma;
  }
}

export async function addKarma(member: GuildMember | string, amount: number) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  await prisma.user.update({
    where: {
      id: id,
    },
    data: {
      karma: { increment: amount },
    },
  });

  await redis.del(`${Constants.redis.cache.user.KARMA}:${id}`);
}

export async function removeKarma(member: GuildMember | string, amount: number) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  await prisma.user.update({
    where: {
      id: id,
    },
    data: {
      karma: { decrement: amount },
    },
  });

  await redis.del(`${Constants.redis.cache.user.KARMA}:${id}`);
}
