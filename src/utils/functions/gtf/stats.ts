import prisma from "../../../init/database";
import { addProgress } from "../economy/achievements";
import { addTaskProgress } from "../economy/tasks";
import { publishLeaderboardUpdate } from "../leaderboards/publish";

export async function getGameStats(userId: string) {
  const [stats] = await prisma.$queryRaw<
    {
      wins: number;
      losses: number;
      fastest: number | null;
      average: number | null;
      averageGuesses: number | null;
    }[]
  >`
    SELECT
      COUNT(*) FILTER (WHERE won)::int AS wins,
      COUNT(*) FILTER (WHERE NOT won)::int AS losses,
      MIN(time) FILTER (WHERE won) AS fastest,
      (AVG(time) FILTER (WHERE won))::double precision AS average,
      (AVG(cardinality(guesses)) FILTER (WHERE won))::double precision AS "averageGuesses"
    FROM "FlagGame"
    WHERE "userId" = ${userId}
  `;

  const [higherWins, fasterPlayers] = await Promise.all([
    stats.wins > 0
      ? prisma.flagGame.groupBy({
          by: ["userId"],
          where: { won: true },
          having: { userId: { _count: { gt: stats.wins } } },
        })
      : Promise.resolve([]),
    stats.fastest != null
      ? prisma.flagGame.groupBy({
          by: ["userId"],
          where: { won: true, time: { lt: stats.fastest } },
        })
      : Promise.resolve([]),
  ]);

  return {
    ...stats,
    winPosition: stats.wins > 0 ? higherWins.length + 1 : undefined,
    timePosition: stats.fastest != null ? fasterPlayers.length + 1 : undefined,
  };
}

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
