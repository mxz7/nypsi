import { GuildMember } from "discord.js";
import { inPlaceSort } from "fast-sort";
import prisma from "../../../init/database";
import { logger } from "../../logger";
import { addProgress } from "./achievements";

export async function getGambleStats(member: GuildMember) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  const query = await prisma.game.groupBy({
    where: {
      AND: [{ userId: id }, { game: { not: { contains: "scratch" } } }],
    },
    by: ["game"],
    _count: {
      _all: true,
    },
    _avg: {
      bet: true,
    },
    _sum: {
      win: true,
      bet: true,
      earned: true,
      xpEarned: true,
    },
  });

  inPlaceSort(query).desc((i) => i._count._all);

  return query;
}

export async function getScratchCardStats(member: GuildMember) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  const query = await prisma.game.groupBy({
    where: {
      AND: [{ userId: id }, { game: { contains: "scratch" } }],
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

export async function getStat(userId: string, stat: string) {
  return await prisma.stats.findUnique({
    where: {
      userId_itemId: {
        userId,
        itemId: stat,
      },
    },
  });
}

export async function getStats(member: GuildMember) {
  const query = await prisma.stats.findMany({
    where: {
      userId: member.user.id,
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
    win: boolean;
    bet: number;
    earned?: number;
    xp?: number;
    outcome: string;
  },
  attempts = 1
): Promise<string> {
  let fail = false;
  const res = await prisma.game
    .create({
      data: {
        userId: opts.userId,
        game: opts.game,
        win: opts.win ? 1 : 0,
        bet: opts.bet,
        earned: opts.earned || 0,
        xpEarned: opts.xp || 0,
        outcome: opts.outcome,
      },
      select: {
        id: true,
      },
    })
    .catch((e) => {
      logger.warn("stats error", e);
      fail = true;
    });

  if (fail || !res) {
    if (attempts > 10) return "failed to create game";
    return createGame(opts, attempts + 1);
  }

  addProgress(opts.userId, "gambler", 1);

  return res.id.toString(36);
}

export async function fetchGame(id: string) {
  return await prisma.game.findUnique({
    where: {
      id: parseInt(id, 36),
    },
  });
}

export async function addStat(member: GuildMember | string, item: string, amount = 1) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  await prisma.stats.upsert({
    where: {
      userId_itemId: {
        itemId: item,
        userId: id,
      },
    },
    update: {
      amount: { increment: amount },
    },
    create: {
      userId: id,
      itemId: item,
      amount: amount,
    },
  });
}

export async function setStat(member: GuildMember | string, item: string, amount: number) {
  let id: string;
  if (member instanceof GuildMember) {
    id = member.user.id;
  } else {
    id = member;
  }

  await prisma.stats.upsert({
    where: {
      userId_itemId: {
        itemId: item,
        userId: id,
      },
    },
    update: {
      amount: amount,
    },
    create: {
      userId: id,
      itemId: item,
      amount: amount,
    },
  });
}
