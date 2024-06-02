import { ChatReactionWordList } from "@prisma/client";
import { Guild } from "discord.js";
import { readFile } from "fs/promises";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import Constants from "../../Constants";

let english1k: string[];
let english5k: string[];
let english10k: string[];

export async function getWordListType(guild: Guild) {
  const cache = await redis.get(`${Constants.redis.cache.chatReaction.WORD_LIST_TYPE}:${guild.id}`);

  if (cache) return cache as ChatReactionWordList;

  const query = await prisma.chatReaction.findUnique({
    where: {
      guildId: guild.id,
    },
    select: {
      wordListType: true,
    },
  });

  await redis.set(
    `${Constants.redis.cache.chatReaction.WORD_LIST_TYPE}:${guild.id}`,
    query.wordListType,
    "EX",
    3600,
  );

  return query.wordListType;
}

export async function getWords(guild: Guild) {
  const type = await getWordListType(guild);

  if (type === "custom") {
    const cache = await redis.get(`${Constants.redis.cache.chatReaction.WORD_LIST}:${guild.id}`);

    if (cache) {
      return cache.split(" ");
    } else {
      const query = await prisma.chatReaction.findUnique({
        where: {
          guildId: guild.id,
        },
        select: {
          wordList: true,
        },
      });

      await redis.set(
        `${Constants.redis.cache.chatReaction.WORD_LIST}:${guild.id}`,
        query.wordList.join(" "),
        "EX",
        86400,
      );

      return query.wordList;
    }
  } else if (type === "english_1k") {
    if (english1k) {
      return english1k;
    }

    const words = await readFile("data/chatreaction/english_1k.txt").then((r) =>
      r.toString().split("\n"),
    );

    english1k = words;

    return words;
  } else if (type === "english_5k") {
    if (english5k) {
      return english5k;
    }

    const words = await readFile("data/chatreaction/english_5k.txt").then((r) =>
      r.toString().split("\n"),
    );

    english5k = words;

    return words;
  } else if (type === "english_10k") {
    if (english10k) {
      return english10k;
    }

    const words = await readFile("data/chatreaction/english_10k.txt").then((r) =>
      r.toString().split("\n"),
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

  await redis.del(
    `${Constants.redis.cache.chatReaction.WORD_LIST}:${guild.id}`,
    `${Constants.redis.cache.chatReaction.WORD_LIST_TYPE}:${guild.id}`,
  );
}

export async function updateWords(guild: Guild, newWordList: string[]) {
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
