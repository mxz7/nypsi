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
      workers: true,
    },
  });

  for (const user of users) {
    for (const workerId of Object.keys(user.workers)) {
      await prisma.economyWorker.create({
        data: {
          userId: user.userId,
          workerId: conversions.get(workerId),
        },
      });
    }
  }
}

main();
