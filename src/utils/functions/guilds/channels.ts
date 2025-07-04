import { Guild } from "discord.js";
import prisma from "../../../init/database";

const disabledChannels = new Map<string, string[]>();

export async function getDisabledChannels(guild: Guild) {
  if (disabledChannels.has(guild.id)) {
    return disabledChannels.get(guild.id);
  }

  const query = await prisma.guild.findUnique({
    where: {
      id: guild.id,
    },
    select: {
      disabledChannels: true,
    },
  });

  setTimeout(() => {
    if (disabledChannels.has(guild.id)) disabledChannels.delete(guild.id);
  }, 43200000);

  disabledChannels.set(guild.id, query.disabledChannels);

  return query.disabledChannels;
}

export async function setDisabledChannels(guild: Guild, channels: string[]) {
  await prisma.guild.update({
    where: {
      id: guild.id,
    },
    data: {
      disabledChannels: channels,
    },
  });

  setTimeout(() => {
    if (disabledChannels.has(guild.id)) disabledChannels.delete(guild.id);
  }, 43200000);

  disabledChannels.set(guild.id, channels);
}
