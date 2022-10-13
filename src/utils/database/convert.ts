import prisma from "./database";

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
          workerId: workerId,
        },
      });
    }
  }
}

main();
