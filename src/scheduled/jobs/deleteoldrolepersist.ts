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

  parentPort.postMessage(`deleted ${query.count.toLocaleString()} old role persist data`);

  process.exit(0);
};
