import { parentPort } from "worker_threads";
import prisma from "../../init/database";

(async () => {
  const query = await prisma.wholesomeSuggestion.count();

  if (query == 0) {
    await prisma.$executeRaw`ALTER SEQUENCE "WholesomeSuggestion_id_seq" RESTART WITH 1;`;
    parentPort.postMessage("reset wholesome suggestion count");
  }

  process.exit(0);
})();
