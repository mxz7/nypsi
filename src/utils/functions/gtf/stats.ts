import prisma from "../../../init/database";
import { addProgress } from "../economy/achievements";
import { addTaskProgress } from "../economy/tasks";
import { publishLeaderboardUpdate } from "../leaderboards/publish";

export async function saveGameStats(
  userId: string,
  countryId: string,
  guesses: string[],
  won: boolean,
  time?: number,
) {
  const previous = won
    ? await prisma.flagGame.aggregate({
        where: { userId, won: true },
        _min: { time: true },
      })
    : undefined;

  await prisma.flagGame.create({
    data: { time, won, userId, country: countryId, guesses },
    select: { id: true },
  });

  if (!won) return;

  addProgress(userId, "flag", 1);
  addTaskProgress(userId, "flag_daily");
  addTaskProgress(userId, "flag_weekly");
  publishLeaderboardUpdate("flag-wins", userId, "1", true);

  const newFastest = previous._min.time != null && time < previous._min.time;

  if (time != null && (previous._min.time == null || newFastest)) {
    publishLeaderboardUpdate("flag-time", userId, time.toString());
  }

  const wins = await prisma.flagGame.count({ where: { userId, won: true } });
  const [higherWins, fasterPlayers] = await Promise.all([
    prisma.flagGame.groupBy({
      by: ["userId"],
      where: { won: true },
      having: { userId: { _count: { gt: wins } } },
    }),
    newFastest
      ? prisma.flagGame.groupBy({
          by: ["userId"],
          where: { won: true, time: { lt: time } },
        })
      : Promise.resolve([]),
  ]);

  return {
    wins,
    winPosition: higherWins.length + 1,
    newFastest,
    time,
    timePosition: newFastest ? fasterPlayers.length + 1 : undefined,
  };
}
