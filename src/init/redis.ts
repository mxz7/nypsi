import Redis from "ioredis";

const redis = new Redis({
  showFriendlyErrorStack: true,
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  reconnectOnError(err) {
    const targets = ["ECONNRESET", "UNCERTAIN_STATE"];
    for (const target of targets) {
      if (err.message.includes(target)) {
        return true;
      }
    }
  },
});

export default redis;
