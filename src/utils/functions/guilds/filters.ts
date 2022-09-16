import { Guild } from "discord.js";
import prisma from "../../database/database";

const chatFilterCache = new Map<string, string[]>();
const snipeFilterCache = new Map<string, string[]>();

export async function getSnipeFilter(guild: Guild): Promise<string[]> {
  if (snipeFilterCache.has(guild.id)) {
    return snipeFilterCache.get(guild.id);
  }

  const query = await prisma.guild.findUnique({
    where: {
      id: guild.id,
    },
    select: {
      snipeFilter: true,
    },
  });

  const filter = query.snipeFilter;

  snipeFilterCache.set(guild.id, filter);

  setTimeout(() => {
    if (snipeFilterCache.has(guild.id)) snipeFilterCache.delete(guild.id);
  }, 43200000);

  return filter;
}

export async function updateSnipeFilter(guild: Guild, array: string[]) {
  await prisma.guild.update({
    where: {
      id: guild.id,
    },
    data: {
      snipeFilter: array,
    },
  });
  if (snipeFilterCache.has(guild.id)) snipeFilterCache.delete(guild.id);
}

export async function getChatFilter(guild: Guild): Promise<string[]> {
  if (chatFilterCache.has(guild.id)) {
    return chatFilterCache.get(guild.id);
  }

  const query = await prisma.guild.findUnique({
    where: {
      id: guild.id,
    },
    select: {
      chatFilter: true,
    },
  });

  chatFilterCache.set(guild.id, query.chatFilter);

  setTimeout(() => {
    if (chatFilterCache.has(guild.id)) chatFilterCache.delete(guild.id);
  }, 43200000);

  return query.chatFilter;
}

export async function updateChatFilter(guild: Guild, array: string[]) {
  await prisma.guild.update({
    where: {
      id: guild.id,
    },
    data: {
      chatFilter: array,
    },
  });

  if (chatFilterCache.has(guild.id)) chatFilterCache.delete(guild.id);
}
