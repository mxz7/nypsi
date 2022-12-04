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
      net_worth: true,
    },
    orderBy: {
      net_worth: "desc",
    },
    take: 25,
  });

  const date = new Date();

  for (const user of query) {
    await prisma.graphMetrics.create({
      data: {
        userId: user.userId,
        value: user.net_worth,
        date,
        category: "networth",
      },
    });
  }
}

async function doCookies() {
  const query = await prisma.inventory.findMany({
    where: {
      item: "cookie",
    },
    select: {
      userId: true,
      amount: true,
    },
    orderBy: {
      amount: "desc",
    },
    take: 25,
  });

  const date = new Date();

  for (const user of query) {
    await prisma.graphMetrics.create({
      data: {
        userId: user.userId,
        value: user.amount,
        date,
        category: "cookies",
      },
    });
  }
}

(async () => {
  await Promise.all([doTopBalance(), doTopNetworth(), doCookies()]);

  process.exit(0);
})();
