import dayjs = require("dayjs");
import { parentPort } from "worker_threads";
import prisma from "../../init/database";

async () => {
  const limit = dayjs().subtract(30, "days").toDate();

  const query = await prisma.rolePersist.deleteMany({
    where: {
      createdAt: { lt: limit },
    },
  });

  parentPort.postMessage(`${query.count.toLocaleString()} role persist data purged`);

  process.exit(0);
};
