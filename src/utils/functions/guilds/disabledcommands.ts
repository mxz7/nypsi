import { Guild } from "discord.js";
import prisma from "../../../init/database";

const disableCache = new Map<string, string[]>();

export async function getDisabledCommands(guild: Guild): Promise<string[]> {
  if (disableCache.has(guild.id)) {
    return disableCache.get(guild.id);
  }

  console.log("1");
  const query = await prisma.guild
    .findUnique({
      where: {
        id: guild.id,
      },
      select: {
        disabledCommands: true,
      },
    })
    .catch((e) => {
      console.log(e);
    });

  console.log("2");

  if (!query) return;

  disableCache.set(guild.id, query.disabledCommands);

  setTimeout(() => {
    if (disableCache.has(guild.id)) disableCache.delete(guild.id);
  }, 43200000);

  return query.disabledCommands;
}

export async function updateDisabledCommands(guild: Guild, array: string[]) {
  await prisma.guild.update({
    where: {
      id: guild.id,
    },
    data: {
      disabledCommands: array,
    },
  });

  if (disableCache.has(guild.id)) disableCache.delete(guild.id);
}
