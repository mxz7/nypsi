import dayjs = require("dayjs");
import prisma from "../../init/database";

async function doTopBalance() {
  const query = await prisma.economy.findMany({
    select: {
      userId: true,
      money: true,
    },
    orderBy: {
      money: "desc",
    },
    take: 25,
  });

  const date = new Date();

  for (const user of query) {
    await prisma.graphMetrics.create({
      data: {
        value: user.money,
        date,
        userId: user.userId,
        category: "balance",
      },
    });
  }
}

async function doTopNetworth() {
  const query = await prisma.economy.findMany({
    select: {
      userId: true,
      netWorth: true,
    },
    orderBy: {
      netWorth: "desc",
    },
    take: 25,
  });

  const date = new Date();

  for (const user of query) {
    await prisma.graphMetrics.create({
      data: {
        userId: user.userId,
        value: user.netWorth,
        date,
        category: "networth",
      },
    });
  }
}

async function doItems() {
  const query = await prisma.inventory.groupBy({
    by: ["item"],
    _sum: {
      amount: true,
    },
  });

  const date = new Date();

  for (const i of query) {
    await prisma.graphMetrics.create({
      data: {
        category: `item-count-${i.item}`,
        date,
        userId: "global",
        value: i._sum.amount,
      },
    });
  }
}

async function doMembers() {
  const query = await prisma.premium.findMany({
    select: {
      userId: true,
      user: {
        select: {
          karma: true,
          Economy: {
            select: {
              money: true,
              netWorth: true,
              Inventory: true,
            },
          },
        },
      },
    },
  });

  const date = new Date();

  for (const user of query) {
    if (user.user?.Economy?.money) {
      await prisma.graphMetrics.create({
        data: {
          category: "user-money",
          date,
          userId: user.userId,
          value: user.user.Economy.money,
        },
      });
    }
    if (user.user?.Economy?.netWorth) {
      await prisma.graphMetrics.create({
        data: {
          category: "user-net",
          date,
          userId: user.userId,
          value: user.user.Economy.netWorth,
        },
      });
    }
    if (user.user?.Economy?.Inventory.length > 0) {
      await prisma.graphMetrics.createMany({
        data: user.user.Economy.Inventory.map((i) => ({
          category: `user-item-${i.item}`,
          date: new Date(),
          userId: i.userId,
          value: i.amount,
        })),
      });
    }
    if (user.user?.karma) {
      await prisma.graphMetrics.create({
        data: {
          category: "user-karma",
          date,
          userId: user.userId,
          value: user.user.karma,
        },
      });
    }
  }
}

async function clearOld() {
  await prisma.graphMetrics.deleteMany({
    where: {
      AND: [
        { OR: [{ category: { contains: "user" } }, { category: { contains: "item-count" } }] },
        { date: { lt: dayjs().subtract(90, "day").toDate() } },
      ],
    },
  });
}

(async () => {
  await Promise.all([doTopBalance(), doTopNetworth(), doItems(), doMembers(), clearOld()]);

  process.exit(0);
})();
