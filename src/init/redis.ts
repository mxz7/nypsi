import Redis from "ioredis";

const redis = new Redis({
  showFriendlyErrorStack: true,
  commandTimeout: 10000,
});

export default redis;
