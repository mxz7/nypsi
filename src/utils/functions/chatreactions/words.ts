import { readFile } from "fs/promises";
import { Guild } from "discord.js";
import { ChatReactionWordList } from "#generated/prisma";
import prisma from "../../../init/database";
import { RedisCache } from "../../cache";
import Constants from "../../Constants";

let english1k: string[];
let english5k: string[];
let english10k: string[];
const wordListTypeCache = new RedisCache<ChatReactionWordList>(
  Constants.redis.cache.chatReaction.WORD_LIST_TYPE,
  3600,
);
const wordListCache = new RedisCache<string[]>(Constants.redis.cache.chatReaction.WORD_LIST, 86400);

export async function getWordListType(guild: Guild) {
  const cached = await wordListTypeCache.get(guild.id);
  if (cached) return cached;

  const query = await prisma.chatReaction.findUnique({
    where: {
      guildId: guild.id,
    },
    select: {
      wordListType: true,
    },
  });

  await wordListTypeCache.set(guild.id, query.wordListType);

  return query.wordListType;
}

export async function getWords(guild: Guild, type?: ChatReactionWordList) {
  if (!type) type = await getWordListType(guild);

  if (type === "custom") {
    const cached = await wordListCache.get(guild.id);

    if (cached) {
      if (cached.length === 0) return getWords(guild, "english_1k");
      return cached;
    } else {
      const query = await prisma.chatReaction.findUnique({
        where: {
          guildId: guild.id,
        },
        select: {
          wordList: true,
        },
      });

      await wordListCache.set(guild.id, query.wordList);

      if (query.wordList.length === 0) return getWords(guild, "english_1k");

      return query.wordList;
    }
  } else if (type === "english_1k") {
    if (english1k) {
      return english1k;
    }

    const words = await readFile("data/chatreaction/english_1k.txt").then((r) =>
      r
        .toString()
        // i love windows
        .replaceAll("\r", "")
        .split("\n")
        .filter((word) => word.length > 2),
    );

    english1k = words;

    return words;
  } else if (type === "english_5k") {
    if (english5k) {
      return english5k;
    }

    const words = await readFile("data/chatreaction/english_5k.txt").then((r) =>
      r
        .toString()
        // i love windows
        .replaceAll("\r", "")
        .split("\n")
        .filter((word) => word.length > 2),
    );

    english5k = words;

    return words;
  } else if (type === "english_10k") {
    if (english10k) {
      return english10k;
    }

    const words = await readFile("data/chatreaction/english_10k.txt").then((r) =>
      r
        .toString()
        // i love windows
        .replaceAll("\r", "")
        .split("\n")
        .filter((word) => word.length > 2),
    );

    english10k = words;

    return words;
  }

  return ["error"];
}

export async function setWordListType(guild: Guild, type: ChatReactionWordList) {
  await prisma.chatReaction.update({
    where: {
      guildId: guild.id,
    },
    data: {
      wordListType: type,
    },
  });

  await Promise.all([wordListCache.delete(guild.id), wordListTypeCache.delete(guild.id)]);
}

export async function updateWords(guild: Guild, newWordList: string[]) {
  await wordListCache.delete(guild.id);

  await prisma.chatReaction.update({
    where: {
      guildId: guild.id,
    },
    data: {
      wordList: newWordList,
    },
  });
}

export async function getWordList(guild: Guild) {
  const query = await prisma.chatReaction.findUnique({
    where: {
      guildId: guild.id,
    },
    select: {
      wordList: true,
    },
  });

  return query.wordList;
}
