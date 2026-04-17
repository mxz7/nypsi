import redis from "../init/redis";
import { logger } from "./logger";

export class RedisCache<T> {
  private key: string;
  private ttl: number;

  constructor(key: string, ttl: number) {
    this.key = key;
    this.ttl = ttl;
  }

  async get(arg: string): Promise<T | null> {
    const data = await redis.get(`${this.key}:${arg.toLowerCase()}`);
    if (!data) return null;

    try {
      return redisDeserialize<T>(data);
    } catch (error) {
      logger.error("redis-cache: failed to parse cached data", { key: this.key, arg, error });
      return null;
    }
  }

  async set(arg: string, value: T, ttlSeconds?: number): Promise<void> {
    const ttl = ttlSeconds ?? this.ttl;
    try {
      await redis.set(`${this.key}:${arg.toLowerCase()}`, redisSerialize(value), "EX", ttl);
    } catch (error) {
      logger.error("redis-cache: failed to set cached data", { key: this.key, arg, error });
    }
  }
}

export function redisSerialize(value: unknown) {
  return JSON.stringify(value, (_key, currentValue) => {
    if (typeof currentValue === "bigint") {
      return { __nypsiType: "bigint", value: currentValue.toString() };
    }

    return currentValue;
  });
}

export function redisDeserialize<T>(value: string): T {
  return JSON.parse(value, (_key, currentValue) => {
    if (
      currentValue &&
      typeof currentValue === "object" &&
      "__nypsiType" in currentValue &&
      currentValue.__nypsiType === "bigint" &&
      "value" in currentValue
    ) {
      return BigInt(currentValue.value as string);
    }
    return currentValue;
  }) as T;
}
