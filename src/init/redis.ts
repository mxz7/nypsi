import Redis from "ioredis";
import { logger } from "../utils/logger";

const redis = new Redis({
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT || "6379"),
  password: process.env.REDIS_PASSWORD,
  showFriendlyErrorStack: true,
  maxRetriesPerRequest: 20,
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    logger.info(`Retrying Redis connection in ${delay}ms (attempt ${times})`);
    return delay;
  }
});

redis.on("error", (error) => {
  logger.error("Redis connection error:", error);
});

redis.on("connect", () => {
  logger.info("Successfully connected to Redis");
});

redis.on("ready", () => {
  logger.info("Redis client is ready");
});

export default redis;