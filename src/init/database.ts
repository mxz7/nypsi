import { PrismaClient } from "@prisma/client";
import { parentPort } from "worker_threads";
import Constants from "../utils/Constants";
import { logger } from "../utils/logger";
import redis from "./redis";

const prisma = new PrismaClient();

prisma.$use(async (params, next) => {
  const before = Date.now();

  const result = await next(params);

  const timeTaken = Date.now() - before;

  if (params.model === "Mention") return result;

  if (timeTaken > 100 && !parentPort) {
    logger.warn(`query ${params.model}.${params.action} took ${timeTaken}ms`);
    logger.debug(params.args);
    console.trace();
  }

  setImmediate(async () => {
    await redis.lpush(Constants.redis.nypsi.HOURLY_DB_REPORT, timeTaken);
  });

  return result;
});

export default prisma;
