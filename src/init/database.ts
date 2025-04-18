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
        if (timeTaken > 1000 && !parentPort) {
          let loggerArgs: typeof args;
          if (
            JSON.stringify(
              args,
              (key, value) => (typeof value === "bigint" ? value.toString() : value),
              "\n",
            ).split("\n").length <= 250
          ) {
            loggerArgs = args;
          }

          if (timeTaken > 15000) {
            logger.warn(`query ${model}.${operation} took ${timeTaken.toFixed(2)}ms`, loggerArgs);
          } else {
            logger.debug(`query ${model}.${operation} took ${timeTaken.toFixed(2)}ms`, loggerArgs);
          }
        }

        return result;
      },
    },
  },
});

export default prisma;
