import { Prisma } from "#generated/prisma";
import prisma from "../../../init/database";
import { getUserId, MemberResolvable } from "../member";
import { getItems } from "./utils";

type LotteryAutoBuyMode = "daily" | "lottery";

export async function getApproximatePrizePool(superdraw = false) {
  let where: Prisma.InventoryWhereInput = {
    item: "lottery_ticket",
  };

  if (superdraw) {
    where = {
      item: { in: ["lottery_ticket", "superdraw_lottery_ticket"] },
    };
  }

  const tickets = await prisma.inventory.aggregate({
    where,
    _sum: {
      amount: true,
    },
  });

  return getPoolRange(Number(tickets._sum.amount ?? 0n));
}

function getPoolRange(ticketCount: number) {
  const effectiveTickets = Math.max(ticketCount, 750);
  const value = getItems()["lottery_ticket"].buy;

  const stepTickets = Math.max(750, Math.round(effectiveTickets));

  const minTickets = Math.floor(effectiveTickets / stepTickets) * stepTickets;
  const maxTickets = minTickets + stepTickets;

  return {
    min: minTickets * value,
    max: maxTickets * value,
  };
}

export async function getLotteryAutoBuySettings(member: MemberResolvable) {
  const query = await prisma.economy.findUnique({
    where: {
      userId: getUserId(member),
    },
    select: {
      autobuyLotteryTicketsAmount: true,
      autobuyLotteryTicketsTime: true,
    },
  });

  return {
    amount: query.autobuyLotteryTicketsAmount,
    time: query.autobuyLotteryTicketsTime,
  };
}

export async function setLotteryAutoBuySettings(
  member: MemberResolvable,
  amount: number | null,
  mode: LotteryAutoBuyMode | null,
) {
  await prisma.economy.update({
    where: {
      userId: getUserId(member),
    },
    data: {
      autobuyLotteryTicketsAmount: amount < 1 ? null : amount,
      autobuyLotteryTicketsTime: mode,
    },
  });
}

export async function getLotteryAutoBuyUsers(isDailyAutoBuyRun: boolean) {
  return prisma.economy.findMany({
    where: {
      autobuyLotteryTicketsAmount: { gt: 0 },
      autobuyLotteryTicketsTime: {
        in: isDailyAutoBuyRun ? ["lottery", "daily"] : ["lottery"],
      },
    },
    select: {
      userId: true,
      autobuyLotteryTicketsAmount: true,
      user: {
        select: {
          DMSettings: {
            select: {
              other: true,
            },
          },
        },
      },
    },
  });
}

export async function createLotteryEntry(
  winnerId: string,
  winnerTickets: number,
  totalTickets: number,
  totalWinnings: number,
  type: "standard" | "superdraw" = "standard",
) {
  await prisma.lottery.create({
    data: {
      type,
      winnerId,
      winnerTickets: BigInt(winnerTickets),
      totalTickets: BigInt(totalTickets),
      totalWin: BigInt(totalWinnings),
    },
  });
}

export async function getLotteryStats(member: MemberResolvable) {
  const userId = getUserId(member);

  const wins = await prisma.lottery.findMany({
    where: {
      winnerId: userId,
    },
    orderBy: {
      date: "desc",
    },
    select: {
      date: true,
      type: true,
      winnerTickets: true,
      totalTickets: true,
    },
  });

  const mostRecentWin = wins[0] ?? null;

  let biggestWin = wins[0] ?? null;

  for (const win of wins) {
    if (!biggestWin || win.winnerTickets > biggestWin.winnerTickets) {
      biggestWin = win;
    }
  }

  return {
    wins: wins.length,
    mostRecentWin,
    biggestWin,
  };
}
