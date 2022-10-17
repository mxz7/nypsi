import { Guild } from "discord.js";
import prisma from "../../../init/database";

export async function createProfile(guild: Guild) {
  await prisma.moderation.create({
    data: {
      guildId: guild.id,
    },
  });
}

export async function profileExists(guild: Guild) {
  const query = await prisma.moderation.findUnique({
    where: {
      guildId: guild.id,
    },
    select: {
      guildId: true,
    },
  });

  if (!query) {
    return false;
  } else {
    return true;
  }
}

export async function deleteServer(guild: Guild | string) {
  let id: string;
  if (guild instanceof Guild) {
    id = guild.id;
  } else {
    id = guild;
  }

  await prisma.moderationMute.deleteMany({
    where: {
      guildId: id,
    },
  });
  await prisma.moderationBan.deleteMany({
    where: {
      guildId: id,
    },
  });
  await prisma.moderationCase.deleteMany({
    where: {
      guildId: id,
    },
  });
  await prisma.moderation.delete({
    where: {
      guildId: id,
    },
  });
}
