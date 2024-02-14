import { PrismaClient } from "@prisma/client";
import { parentPort } from "worker_threads";
import Constants from "../utils/Constants";
import { logger } from "../utils/logger";
import redis from "./redis";

const prisma = new PrismaClient().$extends({
  query: {
    $allModels: {
      async $allOperations({ query, args, model, operation }) {
        const start = performance.now();
        const result = await query(args);
        const end = performance.now();

        const timeTaken = end - start;

        if (["Mention", "GraphMetrics"].includes(model)) return result;

        redis.lpush(Constants.redis.nypsi.HOURLY_DB_REPORT, timeTaken);
        if (timeTaken > 500 && !parentPort) {
          if (JSON.stringify(args).split("\n").length > 100) {
            logger.warn(`query ${model}.${operation} took ${timeTaken.toFixed(2)}ms`);
          } else {
            logger.warn(`query ${model}.${operation} took ${timeTaken.toFixed(2)}ms`, args);
          }
        }

        return result;
      },
    },
  },
});

export default prisma;
