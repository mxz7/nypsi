import ms from "ms";
import redis from "../init/redis";
import { logger } from "./logger";

export class RedisCache<T> {
  private key: string;
  private ttl: number;

  constructor(key: string, ttlSeconds: number) {
    this.key = key;
    this.ttl = ttlSeconds;
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

export class MapCache<T> {
  private store: Map<string, { value: T; expiresAt: number }>;
  private ttl: number;

  constructor(ttl: number) {
    this.store = new Map();
    this.ttl = ttl;

    setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.store.entries()) {
        if (now > entry.expiresAt) {
          this.store.delete(key);
        }
      }
    }, ms("10 minutes"));
  }

  get(key: string): T | null {
    const entry = this.store.get(key);

    if (!entry) return null;

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }

    return entry.value;
  }

  set(key: string, value: T, ttlSeconds?: number): void {
    const ttl = ttlSeconds ?? this.ttl;

    this.store.set(key, {
      value: value,
      expiresAt: Date.now() + ttl * 1000,
    });
  }
}
