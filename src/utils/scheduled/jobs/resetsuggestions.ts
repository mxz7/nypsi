import prisma from "../../database/database";

(async () => {
  const query = await prisma.wholesomeSuggestion.count();

  if (query == 0) {
    await prisma.$executeRaw`ALTER SEQUENCE "WholesomeSuggestion_id_seq" RESTART WITH 1;`;
  }
})();
