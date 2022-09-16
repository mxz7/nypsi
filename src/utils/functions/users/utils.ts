import { GuildMember, User } from "discord.js";
import prisma from "../../database/database";
import redis from "../../database/redis";
import ms = require("ms");

export async function hasProfile(member: GuildMember | string) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  if (await redis.exists(`cache:user:exists:${id}`)) {
    return (await redis.get(`cache:user:exists:${id}`)) === "true" ? true : false;
  }

  const query = await prisma.user.findUnique({
    where: {
      id: id,
    },
    select: {
      id: true,
    },
  });

  if (query) {
    await redis.set(`cache:user:exists:${id}`, "true");
    await redis.expire(`cache:user:exists:${id}`, ms("1 hour") / 1000);
    return true;
  } else {
    await redis.set(`cache:user:exists:${id}`, "false");
    await redis.expire(`cache:user:exists:${id}`, ms("1 hour") / 1000);
    return false;
  }
}

export async function createProfile(member: User | string) {
  let id: string;
  let username = "";
  if (member instanceof User) {
    username = `${member.username}#${member.discriminator}`;
    id = member.id;
  } else {
    id = member;
  }

  await prisma.user
    .create({
      data: {
        id: id,
        lastKnownTag: username,
        lastCommand: new Date(0),
      },
    })
    .catch(() => {});
  await redis.del(`cache:user:exists:${id}`);
}
