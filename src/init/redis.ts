import Redis from "ioredis";

const redis = new Redis({
  showFriendlyErrorStack: true,
});

export default redis;
