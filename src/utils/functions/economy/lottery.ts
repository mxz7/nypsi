import prisma from "../../../init/database";
import { getUserId, MemberResolvable } from "../member";
import { getItems } from "./utils";

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

export async function getDailyLottoTickets(member: MemberResolvable) {
  const query = await prisma.economy.findUnique({
    where: {
      userId: getUserId(member),
    },
    select: {
      dailyLottery: true,
    },
  });

  return query.dailyLottery;
}

export async function setDailyLotteryTickets(member: MemberResolvable, amount: number) {
  await prisma.economy.update({
    where: {
      userId: getUserId(member),
    },
    data: {
      dailyLottery: amount,
    },
  });
}
