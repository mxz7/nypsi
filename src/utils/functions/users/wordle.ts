import { GuildMember } from "discord.js";
import prisma from "../../../init/database";
import { addProgress } from "../economy/achievements";

export async function getWordleStats(member: GuildMember) {
  const query = await prisma.wordleStats.findUnique({
    where: {
      userId: member.user.id,
    },
  });

  return query;
}

export async function addWordleGame(
  userId: string,
  win: boolean,
  guesses: string[],
  seconds: number,
  word: string,
) {
  if (win) addProgress(userId, "wordle", 1);

  await prisma.wordleGame.create({
    data: {
      time: seconds,
      won: win,
      word,
      guesses,
      userId,
    },
  });
}
