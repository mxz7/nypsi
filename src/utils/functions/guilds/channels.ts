import { Guild } from "discord.js";
import prisma from "../../../init/database";
import { RedisCache } from "../../cache";
import Constants from "../../Constants";

const disabledChannels = new RedisCache<string[]>(
  Constants.redis.cache.guild.DISABLED_CHANNELS,
  43200,
);

export async function getDisabledChannels(guild: Guild) {
  const cached = await disabledChannels.get(guild.id);

  if (cached !== null) return cached;

  const query = await prisma.guild.findUnique({
    where: {
      id: guild.id,
    },
    select: {
      disabledChannels: true,
    },
  });

  await disabledChannels.set(guild.id, query.disabledChannels);

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

  await disabledChannels.set(guild.id, channels);
}
