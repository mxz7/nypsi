import { parentPort } from "worker_threads";
import prisma from "../../init/database";

(async () => {
  const query = await prisma.economy.updateMany({
    where: {
      monthVote: { gt: 0 },
    },
    data: { monthVote: 0 },
  });

  parentPort.postMessage(`${query.count} users reset to 0 monthly votes`);
  parentPort.postMessage("done");
})();
