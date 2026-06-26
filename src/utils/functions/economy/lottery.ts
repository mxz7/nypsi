import prisma from "../../../init/database";
import { getUserId, MemberResolvable } from "../member";
import { getItems } from "./utils";

type LotteryAutoBuyMode = "daily" | "lottery";

export async function getApproximatePrizePool() {
  const tickets = await prisma.inventory.aggregate({
    where: {
      item: "lottery_ticket",
    },
    _sum: {
      amount: true,
    },
  });

  const value = Number(tickets._sum.amount) * getItems()["lottery_ticket"].buy;

  return {
    min: Math.floor(value / 100_000_000) * 100_000_000,
    max: Math.ceil(value / 100_000_000) * 100_000_000,
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
      autobuyLotteryTicketsAmount: amount,
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
) {
  await prisma.lottery.create({
    data: {
      winnerId,
      winnerTickets: BigInt(winnerTickets),
      totalTickets: BigInt(totalTickets),
    },
  });
}
