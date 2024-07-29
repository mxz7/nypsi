import prisma from "../../../init/database";

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
