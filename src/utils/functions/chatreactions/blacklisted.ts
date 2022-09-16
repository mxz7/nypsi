import { Guild } from "discord.js";
import prisma from "../../database/database";

export async function getBlacklisted(guild: Guild) {
  const query = await prisma.chatReaction.findUnique({
    where: {
      guildId: guild.id,
    },
    select: {
      blacklisted: true,
    },
  });

  return query.blacklisted;
}

export async function setBlacklisted(guild: Guild, blacklisted: string[]) {
  await prisma.chatReaction.update({
    where: {
      guildId: guild.id,
    },
    data: {
      blacklisted: blacklisted,
    },
  });
}
