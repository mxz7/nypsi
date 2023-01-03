import { GuildMember, User } from "discord.js";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import Constants from "../../Constants";
import ms = require("ms");

export async function hasProfile(member: GuildMember | string) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  if (await redis.exists(`${Constants.redis.cache.user.EXISTS}:${id}`)) {
    return (await redis.get(`${Constants.redis.cache.user.EXISTS}:${id}`)) === "true" ? true : false;
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
    await redis.set(`${Constants.redis.cache.user.EXISTS}:${id}`, "true");
    await redis.expire(`${Constants.redis.cache.user.EXISTS}:${id}`, Math.floor(ms("24 hour") / 1000));
    return true;
  } else {
    await redis.set(`${Constants.redis.cache.user.EXISTS}:${id}`, "false");
    await redis.expire(`${Constants.redis.cache.user.EXISTS}:${id}`, Math.floor(ms("24 hour") / 1000));
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
  await redis.del(`${Constants.redis.cache.user.EXISTS}:${id}`);
}
