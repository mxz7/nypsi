import { PrismaClient } from "@prisma/client";
import { logger } from "../utils/logger";

const prisma = new PrismaClient();

prisma.$use(async (params, next) => {
  const before = Date.now();

  const result = await next(params);

  const timeTaken = Date.now() - before;

  if (timeTaken > 50) {
    logger.warn(`query ${params.model}.${params.action} took ${timeTaken}ms`);
  }

  return result;
});

export default prisma;
