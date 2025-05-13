import { UserAlias } from "@prisma/client";
import { GuildMember } from "discord.js";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import Constants from "../../Constants";
import ms = require("ms");

export async function getUserAliases(member: GuildMember | string) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  if (await redis.exists(`${Constants.redis.cache.premium.ALIASES}:${id}`)) {
    return JSON.parse(
      await redis.get(`${Constants.redis.cache.premium.ALIASES}:${id}`),
    ) as UserAlias[];
  }

  const query = await prisma.userAlias.findMany({
    where: {
      premium: {
        level: {
          gt: 0,
        },
      },
    },
  });

  await redis.set(
    `${Constants.redis.cache.premium.ALIASES}:${id}`,
    JSON.stringify(query || []),
    "EX",
    ms("12 hour") / 1000,
  );

  return query;
}

export async function addUserAlias(member: GuildMember | string, alias: string, command: string) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  await prisma.userAlias.create({
    data: {
      alias,
      command,
      userId: id,
    },
  });

  await redis.del(`${Constants.redis.cache.premium.ALIASES}:${id}`);
}

export async function removeUserAlias(member: GuildMember | string, alias: string) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  await prisma.userAlias.delete({
    where: {
      userId_alias: {
        alias,
        userId: id,
      },
    },
  });

  await redis.del(`${Constants.redis.cache.premium.ALIASES}:${id}`);
}
