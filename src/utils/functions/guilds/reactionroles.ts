import { ReactionRole, ReactionRoleRoles } from "@prisma/client";
import { Guild } from "discord.js";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import Constants from "../../Constants";
import ms = require("ms");

export async function getReactionRoles(guild: Guild) {
  if (await redis.exists(`${Constants.redis.cache.guild.REACTION_ROLES}:${guild.id}`)) {
    return JSON.parse(await redis.get(`${Constants.redis.cache.guild.REACTION_ROLES}:${guild.id}`)) as (ReactionRole & {
      ReactionRoleRoles: ReactionRoleRoles[];
    })[];
  }

  const query = await prisma.reactionRole.findMany({
    where: {
      guildId: guild.id,
    },
    include: {
      ReactionRoleRoles: true,
    },
  });

  await redis.set(`${Constants.redis.cache.guild.REACTION_ROLES}:${guild.id}`, JSON.stringify(query));
  await redis.expire(`${Constants.redis.cache.guild.REACTION_ROLES}:${guild.id}`, Math.floor(ms("1 hour") / 1000));

  return query;
}
