import prisma from "./database";

const conversions = new Map<string, string>();

conversions.set("0", "potato_farmer");
conversions.set("1", "fisherman");
conversions.set("2", "miner");
conversions.set("3", "lumberjack");
conversions.set("4", "butcher");
conversions.set("5", "tailor");
conversions.set("6", "spacex");

async function main() {
  const users = await prisma.economy.findMany({
    select: {
      userId: true,
      inventory: true,
    },
  });

  for (const user of users) {
    for (const item of Object.keys(user.inventory as { [key: string]: number })) {
      await prisma.inventory.upsert({
        where: {
          userId_item: {
            userId: user.userId,
            item: item,
          },
        },
        update: {
          amount: (user.inventory as { [key: string]: number })[item],
        },
        create: {
          userId: user.userId,
          item: item,
          amount: (user.inventory as { [key: string]: number })[item],
        },
      });
    }
  }
}

main();
