import { Guild } from "discord.js";
import * as fs from "fs/promises";
import prisma from "../../../init/database";

export async function getWords(guild: Guild) {
  const query = await prisma.chatReaction.findUnique({
    where: {
      guildId: guild.id,
    },
    select: {
      wordList: true,
    },
  });

  if (query.wordList.length == 0) {
    const a = await getDefaultWords();

    return a;
  } else {
    return query.wordList;
  }
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

async function getDefaultWords(): Promise<string[]> {
  const words = await fs.readFile("./data/cr_words.txt").then((res) => res.toString().split("\n"));

  return words;
}
