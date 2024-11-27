import prisma from "../../../init/database";
import { getItems } from "./utils";

export async function getApproximatPrizePool() {
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
    min: Math.floor(value / 1_000_000_000) * 1_000_000_000,
    max: Math.ceil(value / 1_000_000_000) * 1_000_000_000,
  };
}

export async function getTicketCount() {
  const query = await prisma.inventory.aggregate({
    where: {
      item: "lottery_ticket",
    },
    _sum: {
      amount: true,
    },
  });

  return Number(query._sum.amount);
}

export async function getDailyLottoTickets(userId: string) {
  const query = await prisma.economy.findUnique({
    where: {
      userId,
    },
    select: {
      dailyLottery: true,
    },
  });

  return query.dailyLottery;
}

export async function setDailyLotteryTickets(userId: string, amount: number) {
  await prisma.economy.update({
    where: {
      userId,
    },
    data: {
      dailyLottery: amount,
    },
  });
}
