import { parentPort } from "worker_threads";
import prisma from "../../init/database";
import { getVersion } from "../../utils/functions/version";

(async () => {
  process.title = `nypsi v${getVersion()}: reset vote job`;

  const query = await prisma.economy.updateMany({
    where: {
      monthVote: { gt: 0 },
    },
    data: { monthVote: 0 },
  });

  parentPort.postMessage(`${query.count} users reset to 0 monthly votes`);
  process.exit(0);
})();
