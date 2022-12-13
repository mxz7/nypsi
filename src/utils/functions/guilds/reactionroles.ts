import { ReactionRole, ReactionRoleMode, ReactionRoleRoles } from "@prisma/client";
import { Guild, GuildTextBasedChannel, Role } from "discord.js";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import { CustomEmbed } from "../../../models/EmbedBuilders";
import Constants from "../../Constants";
import ms = require("ms");

export async function getReactionRolesByGuild(guild: Guild) {
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
      roles: {
        orderBy: {
          createdAt: "desc",
        },
      },
    },
  });

  await redis.set(`${Constants.redis.cache.guild.REACTION_ROLES}:${guild.id}`, JSON.stringify(query));
  await redis.expire(`${Constants.redis.cache.guild.REACTION_ROLES}:${guild.id}`, Math.floor(ms("1 hour") / 1000));

  return query;
}

export async function createReactionRole(options: {
  guildId: string;
  channel: GuildTextBasedChannel;
  title?: string;
  messageDescription: string;
  mode: ReactionRoleMode;
}) {
  const embed = new CustomEmbed().setColor(Constants.TRANSPARENT_EMBED_COLOR);

  if (options.title) embed.setHeader(options.title);
  embed.setDescription(options.messageDescription);

  const msg = await options.channel.send({ embeds: [embed] });

  await prisma.reactionRole.create({
    data: {
      channelId: options.channel.id,
      messageId: msg.id,
      mode: options.mode,
      guildId: options.guildId,
      title: options.title,
    },
  });

  await redis.del(`${Constants.redis.cache.guild.REACTION_ROLES}:${options.guildId}`);
}

export async function addRoleToReactionRole(options: {
  messageId: string;
  guildId: string;
  role: {
    role: Role;
    label: string;
  };
}) {
  await prisma.reactionRoleRoles.create({
    data: {
      roleId: options.role.role.id,
      messageId: options.messageId,
      label: options.role.label,
    },
  });

  await redis.del(`${Constants.redis.cache.guild.REACTION_ROLES}:${options.guildId}`);
}

export async function deleteRoleFromReactionRole(guildId: string, messageId: string, roleId: string) {
  await prisma.reactionRoleRoles.delete({
    where: {
      messageId_roleId: {
        messageId,
        roleId,
      },
    },
  });

  await redis.del(`${Constants.redis.cache.guild.REACTION_ROLES}:${guildId}`);
}

export async function deleteReactionRole(guildId: string, messageId: string) {
  await prisma.reactionRole.delete({
    where: {
      messageId,
    },
  });

  await redis.del(`${Constants.redis.cache.guild.REACTION_ROLES}:${guildId}`);
}
