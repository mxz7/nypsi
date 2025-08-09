import { WordleGame } from "@prisma/client";
import prisma from "../../../init/database";
import { addProgress } from "../economy/achievements";
import { addTaskProgress } from "../economy/tasks";
import { getUserId, MemberResolvable } from "../member";

export async function addWordleGame(
  member: MemberResolvable,
  win: boolean,
  guesses: string[],
  ms: number,
  word: string,
) {
  if (win) {
    addProgress(member, "wordle", 1);
    addTaskProgress(member, "wordles_daily");
    addTaskProgress(member, "wordles_weekly");
  }

  const id = await prisma.wordleGame.create({
    data: {
      time: Math.floor(ms),
      won: win,
      word,
      guesses,
      userId: getUserId(member),
    },
    select: {
      id: true,
    },
  });

  return id.id.toString(36);
}

export async function getWordleGame(id: string) {
  return prisma.wordleGame
    .findUnique({
      where: { id: parseInt(id, 36) },
    })
    .catch(() => undefined as WordleGame);
}
