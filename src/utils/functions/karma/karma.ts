import { GuildMember } from "discord.js";
import prisma from "../../database/database";
import redis from "../../database/redis";
import { createProfile } from "../users/utils";

export async function getKarma(member: GuildMember | string): Promise<number> {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  if (await redis.exists(`cache:user:karma:${id}`)) return parseInt(await redis.get(`cache:user:karma:${id}`));

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
    await redis.set(`cache:user:karma:${id}`, query.karma);
    await redis.expire(`cache:user:karma:${id}`, 300);
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

  await redis.del(`cache:user:karma:${id}`);
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

  await redis.del(`cache:user:karma:${id}`);
}
