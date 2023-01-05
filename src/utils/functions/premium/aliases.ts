import { UserAlias } from "@prisma/client";
import { GuildMember } from "discord.js";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import Constants from "../../Constants";
import ms = require("ms");

export async function getAliases(member: GuildMember | string) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  if (await redis.exists(`${Constants.redis.cache.premium.ALIASES}:${id}`)) {
    return JSON.parse(await redis.get(`${Constants.redis.cache.premium.ALIASES}:${id}`)) as UserAlias[];
  }

  const query = await prisma.userAlias.findMany({
    where: {
      userId: id,
    },
  });

  await redis.set(`${Constants.redis.cache.premium.ALIASES}:${id}`, JSON.stringify(query));
  await redis.expire(`${Constants.redis.cache.premium.ALIASES}:${id}`, Math.floor(ms("12 hour") / 1000));

  return query;
}
