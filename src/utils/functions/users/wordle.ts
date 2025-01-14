import prisma from "../../../init/database";
import { addProgress } from "../economy/achievements";

export async function addWordleGame(
  userId: string,
  win: boolean,
  guesses: string[],
  ms: number,
  word: string,
) {
  if (win) addProgress(userId, "wordle", 1);

  await prisma.wordleGame.create({
    data: {
      time: Math.floor(ms),
      won: win,
      word,
      guesses,
      userId,
    },
  });
}
