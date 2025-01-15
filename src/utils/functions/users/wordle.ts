import prisma from "../../../init/database";
import { addProgress } from "../economy/achievements";
import { addTaskProgress } from "../economy/tasks";

export async function addWordleGame(
  userId: string,
  win: boolean,
  guesses: string[],
  ms: number,
  word: string,
) {
  if (win) {
    addProgress(userId, "wordle", 1);
    addTaskProgress(userId, "wordles_daily");
    addTaskProgress(userId, "wordles_weekly");
  }

  const id = await prisma.wordleGame.create({
    data: {
      time: Math.floor(ms),
      won: win,
      word,
      guesses,
      userId,
    },
    select: {
      id: true,
    },
  });

  return id.id.toString(36);
}

export async function getWordleGame(id: string) {
  const query = await prisma.wordleGame.findUnique({
    where: { id: parseInt(id, 36) },
  });

  return query;
}
