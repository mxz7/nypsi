import Redis from "ioredis";

const redis = new Redis({
  host: process.env.REDIS_HOST || "127.0.0.1",
  showFriendlyErrorStack: true,
  commandTimeout: 10000,
});

export default redis;
