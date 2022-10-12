import { Guild, Message } from "discord.js";
import prisma from "../../database/database";
import { PunishmentType } from "../../models/GuildStorage";
import { addModLog } from "../moderation/logs";
import { getPercentMatch } from "./utils";
import * as stringSimilarity from "string-similarity";

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

export async function checkMessageContent(message: Message) {
  const filter = await getChatFilter(message.guild);
  const match = await getPercentMatch(message.guild);

  let content: string | string[] = message.content.toLowerCase().normalize("NFD");

  content = content.replace(/[^A-z0-9\s]/g, "");

  content = content.split(" ");

  if (content.length >= 69) {
    for (const word of filter) {
      if (content.indexOf(word.toLowerCase()) != -1) {
        addModLog(
          message.guild,
          PunishmentType.FILTER_VIOLATION,
          message.author.id,
          "nypsi",
          content.join(" "),
          -1,
          message.channel.id
        );
        await message.delete().catch(() => {});
        return false;
      }
    }
  } else {
    for (const word of filter) {
      for (const contentWord of content) {
        const similarity = stringSimilarity.compareTwoStrings(word, contentWord);

        if (similarity >= match / 100) {
          const contentModified = content.join(" ").replace(contentWord, `**${contentWord}**`);

          addModLog(
            message.guild,
            PunishmentType.FILTER_VIOLATION,
            message.author.id,
            "nypsi",
            contentModified,
            -1,
            message.channel.id,
            (similarity * 100).toFixed(2)
          );
          await message.delete().catch(() => {});
          return false;
        }
      }
    }
  }
  return true;
}
