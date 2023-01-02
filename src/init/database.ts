import { PrismaClient } from "@prisma/client";
import { parentPort } from "worker_threads";
import { logger } from "../utils/logger";

const prisma = new PrismaClient();

prisma.$use(async (params, next) => {
  const before = Date.now();

  const result = await next(params);

  const timeTaken = Date.now() - before;

  if (timeTaken > 75 && params.model !== "Mention" && !parentPort) {
    logger.warn(`query ${params.model}.${params.action} took ${timeTaken}ms`);
  }

  return result;
});

export default prisma;
