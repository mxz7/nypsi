import dayjs = require("dayjs");
import { parentPort } from "worker_threads";
import prisma from "../../init/database";
import { getVersion } from "../../utils/functions/version";

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

  const date = dayjs()
    .set("hours", 0)
    .set("minutes", 0)
    .set("seconds", 0)
    .set("milliseconds", 0)
    .toDate();

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

  return query.length;
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

  const date = dayjs()
    .set("hours", 0)
    .set("minutes", 0)
    .set("seconds", 0)
    .set("milliseconds", 0)
    .toDate();

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

  return query.length;
}

async function doItems() {
  const query = await prisma.inventory.groupBy({
    by: ["item"],
    _sum: {
      amount: true,
    },
  });

  const date = dayjs()
    .set("hours", 0)
    .set("minutes", 0)
    .set("seconds", 0)
    .set("milliseconds", 0)
    .toDate();

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

  return query.length;
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
              level: true,
              prestige: true,
            },
          },
        },
      },
    },
  });

  const date = dayjs()
    .set("hours", 0)
    .set("minutes", 0)
    .set("seconds", 0)
    .set("milliseconds", 0)
    .toDate();
  let count = 0;

  for (const user of query) {
    if (user.user?.Economy.level || user.user?.Economy.prestige) {
      let level = user.user.Economy.level;

      while (user.user.Economy.prestige > 0) {
        user.user.Economy.prestige--;
        level += 100;
      }

      await prisma.graphMetrics.create({
        data: {
          category: "user-level",
          date,
          userId: user.userId,
          value: level,
        },
      });
    }

    if (user.user?.Economy?.money) {
      await prisma.graphMetrics.create({
        data: {
          category: "user-money",
          date,
          userId: user.userId,
          value: user.user.Economy.money,
        },
      });
      count += 1;
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
      count += 1;
    }
    if (user.user?.Economy?.Inventory.length > 0) {
      await prisma.graphMetrics.createMany({
        data: user.user.Economy.Inventory.map((i) => ({
          category: `user-item-${i.item}`,
          date,
          userId: i.userId,
          value: i.amount,
        })),
      });
      count += user.user.Economy.Inventory.length;
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

      count += 1;
    }
  }

  return count;
}

async function doGuilds() {
  const query = await prisma.economyGuild.findMany({
    select: {
      level: true,
      xp: true,
      balance: true,
      guildName: true,
    },
  });

  const date = dayjs()
    .set("hours", 0)
    .set("minutes", 0)
    .set("seconds", 0)
    .set("milliseconds", 0)
    .toDate();
  let count = 0;

  for (const guild of query) {
    await prisma.graphMetrics.create({
      data: {
        date,
        userId: guild.guildName,
        category: `guild-balance`,
        value: guild.balance,
      },
    });
    await prisma.graphMetrics.create({
      data: {
        date,
        userId: guild.guildName,
        category: `guild-xp`,
        value: guild.xp,
      },
    });
    await prisma.graphMetrics.create({
      data: {
        date,
        userId: guild.guildName,
        category: `guild-level`,
        value: guild.level,
      },
    });
    count += 3;
  }

  return count;
}

async function clearOld() {
  const deleted = await prisma.graphMetrics.deleteMany({
    where: {
      AND: [
        {
          OR: [
            { category: { contains: "user" } },
            { category: { contains: "item-count" } },
            { category: { contains: "item-value" } },
          ],
        },
        { date: { lt: dayjs().subtract(180, "day").toDate() } },
      ],
    },
  });

  parentPort.postMessage(`deleted ${deleted.count.toLocaleString()} entries from graph data`);

  return 0;
}

(async () => {
  process.title = `nypsi v${getVersion()}: top snapshot job`;

  const count = await Promise.all([
    doTopBalance(),
    doTopNetworth(),
    doItems(),
    doMembers(),
    doGuilds(),
    clearOld(),
  ]);

  parentPort.postMessage(
    `created ${count.reduce((a, b) => a + b).toLocaleString()} entries in graph data`,
  );

  process.exit(0);
})();
