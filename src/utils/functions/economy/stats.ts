import { inPlaceSort, sort } from "fast-sort";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import { logger } from "../../logger";
import { getUserId, MemberResolvable } from "../member";
import { addProgress } from "./achievements";
import { addTaskProgress, setTaskProgress } from "./tasks";

export async function getGambleStats(member: MemberResolvable) {
  const query = await prisma.game.groupBy({
    where: {
      userId: getUserId(member),
    },
    by: ["game"],
    _count: {
      _all: true,
    },
    _avg: {
      bet: true,
    },
    _sum: {
      bet: true,
      earned: true,
      xpEarned: true,
    },
  });

  return sort(query).desc((i) => i._count._all);
}

export async function getGameWins(member: MemberResolvable, game: string) {
  return await prisma.game.count({
    where: { AND: [{ userId: getUserId(member) }, { game }, { win: 1 }] },
  });
}

export async function getAllGameWins(name: string) {
  const query = await prisma.game.count({
    where: {
      AND: [{ game: { contains: name } }, { win: 1 }],
    },
  });

  return query;
}

export async function getScratchCardStats(member: MemberResolvable) {
  const query = await prisma.game.groupBy({
    where: {
      AND: [{ userId: getUserId(member) }, { game: { contains: "scratch" } }],
    },
    by: ["game"],
    _count: {
      _all: true,
    },
    _sum: {
      win: true,
    },
  });

  inPlaceSort(query).desc((i) => i._count._all);

  return query;
}

export async function getStat(member: MemberResolvable, stat: string) {
  return await prisma.stats.findUnique({
    where: {
      userId_itemId: {
        userId: getUserId(member),
        itemId: stat,
      },
    },
  });
}

export async function getStats(member: MemberResolvable) {
  const query = await prisma.stats.findMany({
    where: {
      userId: getUserId(member),
    },
    select: {
      amount: true,
      itemId: true,
    },
  });

  inPlaceSort(query).desc((i) => i.amount);

  return query;
}

export async function createGame(
  opts: {
    userId: string;
    game: string;
    result: string; // win, lose, draw
    bet: number;
    earned?: number;
    xp?: number;
    outcome: string;
  },
  attempts = 1,
): Promise<string> {
  let fail = false;
  const res = await prisma.game
    .create({
      data: {
        userId: opts.userId,
        game: opts.game,
        win: opts.result == "win" ? 1 : opts.result == "lose" ? 0 : 2,
        bet: opts.bet,
        earned:
          opts.result === "win"
            ? Math.floor(opts.earned || 0)
            : opts.result === "draw"
              ? Math.floor(opts.bet || 0)
              : 0,
        xpEarned: opts.xp || 0,
        outcome: opts.outcome,
      },
      select: {
        id: true,
      },
    })
    .catch((e) => {
      logger.warn("stats error", { error: e, opts: opts });
      fail = true;
    });

  if (fail || !res) {
    if (attempts > 10) {
      logger.error("failed to create game", opts);
      return "failed to create game";
    }
    return createGame(opts, attempts + 1);
  }

  if (opts.result === "win") {
    addTaskProgress(opts.userId, "gamble_daily");
    addTaskProgress(opts.userId, "gamble_weekly");
    if (!opts.game.includes("scratch")) addTaskProgress(opts.userId, "gamble_streak");
  } else {
    if (!opts.game.includes("scratch")) setTaskProgress(opts.userId, "gamble_streak", 0);
  }

  addProgress(opts.userId, "gambler", 1);

  addStat(opts.userId, "spent-gamble", opts.bet);
  if (opts.earned > 0) addStat(opts.userId, "earned-gamble", opts.earned);

  return res.id.toString(36);
}

export async function fetchGame(id: string) {
  return await prisma.game.findUnique({
    where: {
      id: parseInt(id, 36),
    },
  });
}

export async function addStat(member: MemberResolvable, item: string, amount = 1) {
  const userId = getUserId(member);

  await prisma.stats.upsert({
    where: {
      userId_itemId: {
        itemId: item,
        userId,
      },
    },
    update: {
      amount: { increment: Math.floor(amount) },
    },
    create: {
      userId,
      itemId: item,
      amount: Math.floor(amount),
    },
  });
}

export async function setStat(member: MemberResolvable, item: string, amount: number) {
  const userId = getUserId(member);

  await prisma.stats.upsert({
    where: {
      userId_itemId: {
        itemId: item,
        userId,
      },
    },
    update: {
      amount: amount,
    },
    create: {
      userId,
      itemId: item,
      amount: amount,
    },
  });
}

export async function getLeaderboardPositions(member: MemberResolvable) {
  return await prisma.leaderboards.findMany({
    where: {
      userId: getUserId(member),
    },
    select: {
      leaderboard: true,
      position: true,
    },
  });
}

export async function checkLeaderboardPositions(users: string[], leaderboard: string) {
  if (await redis.exists("nypsi:lb:cooldown:" + leaderboard)) return;
  await redis.set("nypsi:lb:cooldown" + leaderboard, "69", "EX", 600);

  await prisma.leaderboards.deleteMany({
    where: {
      leaderboard,
      position: { gt: users.length },
    },
  });

  for (const user of users) {
    if (users.indexOf(user) > 100) return;
    const query = await prisma.leaderboards.findFirst({
      where: {
        leaderboard,
        userId: user,
      },
      select: {
        position: true,
      },
    });

    if (query) {
      if (query.position === users.indexOf(user)) continue;

      await prisma.leaderboards.delete({
        where: { userId_leaderboard: { userId: user, leaderboard } },
      });
    }

    await prisma.leaderboards.upsert({
      where: {
        leaderboard_position: {
          leaderboard,
          position: users.indexOf(user) + 1,
        },
      },
      update: {
        userId: user,
      },
      create: {
        leaderboard,
        position: users.indexOf(user) + 1,
        userId: user,
      },
    });
  }
}
