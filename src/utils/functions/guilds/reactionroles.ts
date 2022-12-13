import { ReactionRole, ReactionRoleMode, ReactionRoleRoles } from "@prisma/client";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Guild,
  GuildTextBasedChannel,
  MessageActionRowComponentBuilder,
  Role,
} from "discord.js";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import { CustomEmbed } from "../../../models/EmbedBuilders";
import Constants from "../../Constants";
import ms = require("ms");

export async function getReactionRolesByGuild(guild: Guild) {
  if (await redis.exists(`${Constants.redis.cache.guild.REACTION_ROLES}:${guild.id}`)) {
    return JSON.parse(await redis.get(`${Constants.redis.cache.guild.REACTION_ROLES}:${guild.id}`)) as (ReactionRole & {
      roles: ReactionRoleRoles[];
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
      description: options.messageDescription,
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

export async function sendReactionRole(
  reactionRole: ReactionRole & { roles: ReactionRoleRoles[] },
  channel: GuildTextBasedChannel
) {
  const embed = new CustomEmbed().setColor(Constants.TRANSPARENT_EMBED_COLOR);

  if (reactionRole.title) embed.setHeader(reactionRole.title);
  embed.setDescription(reactionRole.description);

  const components: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [];

  for (const role of reactionRole.roles) {
    const button = new ButtonBuilder().setCustomId(role.roleId).setStyle(ButtonStyle.Secondary);

    if (role.label.match(Constants.EMOJI_REGEX)) {
      button.setEmoji(role.label);
    } else {
      button.setLabel(role.label);
    }

    if (components.length === 0) {
      components[0] = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(button);
    } else if (components[components.length - 1].components.length >= 5) {
      components[components.length] = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(button);
    } else {
      components[components.length - 1].addComponents(button);
    }
  }

  const oldMessage = await channel.messages.fetch(reactionRole.messageId);

  if (oldMessage) await oldMessage.delete().catch(() => {});

  const msg = await channel.send({ embeds: [embed], components });

  await prisma.reactionRole.update({
    where: {
      messageId: reactionRole.messageId,
    },
    data: {
      messageId: msg.id,
    },
  });

  await redis.del(`${Constants.redis.cache.guild.REACTION_ROLES}:${reactionRole.guildId}`);
}
