import redis from "../../init/redis";
import { logger } from "../logger";

export abstract class Mutex {
  protected shouldLog: boolean;

  constructor(shouldLog = false) {
    this.shouldLog = shouldLog;
  }

  abstract acquire(key: string): Promise<void>;
  abstract release(key: string): void;
}

export class MemoryMutex extends Mutex {
  private locks = new Map<string, { locked: boolean; queue: (() => void)[] }>();

  async acquire(key: string): Promise<void> {
    if (this.shouldLog) {
      logger.debug(`mutex: requested ${key}`);
    }

    if (!this.locks.has(key)) {
      this.locks.set(key, { locked: false, queue: [] });
    }

    const lock = this.locks.get(key)!;

    if (!lock.locked) {
      if (this.shouldLog) {
        logger.debug(`mutex: acquired instantly ${key}`);
      }
      lock.locked = true;
      return;
    }

    return new Promise((resolve) => {
      lock.queue.push(() => {
        if (this.shouldLog) {
          logger.debug(`mutex: acquired ${key}`);
        }
        resolve();
      });
    });
  }

  release(key: string): void {
    if (this.shouldLog) {
      logger.debug(`mutex: release ${key}`);
    }

    const lock = this.locks.get(key);
    if (!lock) return;

    const next = lock.queue.shift();
    if (next) {
      next();
    } else {
      lock.locked = false;
      // Clean up empty locks to prevent memory leaks
      if (lock.queue.length === 0) {
        this.locks.delete(key);
      }
    }
  }
}

const RELEASE_SCRIPT =
  "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";

export class RedisMutex extends Mutex {
  private readonly ttl: number;
  private readonly pollInterval: number;
  private readonly prefix: string;
  private tokens = new Map<string, string>();

  /**
   * @param prefix        - key prefix to namespace locks and avoid conflicts between instances
   * @param shouldLog     - emit debug log lines
   * @param ttl           - lock TTL in milliseconds (default 5 min)
   * @param pollInterval  - retry interval in milliseconds when the lock is held (default 50 ms)
   */
  constructor(prefix: string, shouldLog = false, ttl = 300_000, pollInterval = 50) {
    super(shouldLog);
    this.ttl = ttl;
    this.pollInterval = pollInterval;
    this.prefix = `mutex:${prefix}`;
  }

  private redisKey(key: string): string {
    return `${this.prefix}:${key}`;
  }

  async acquire(key: string): Promise<void> {
    const token = crypto.randomUUID();
    const redisKey = this.redisKey(key);

    if (this.shouldLog) {
      logger.debug(`redis-mutex: requested ${key}`);
    }

    while (true) {
      const result = await redis.set(redisKey, token, "PX", this.ttl, "NX");
      if (result === "OK") {
        this.tokens.set(key, token);
        if (this.shouldLog) {
          logger.debug(`redis-mutex: acquired ${redisKey}`);
        }
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, this.pollInterval));
    }
  }

  release(key: string): void {
    if (this.shouldLog) {
      logger.debug(`redis-mutex: release ${this.redisKey(key)}`);
    }

    const token = this.tokens.get(key);
    if (!token) return;

    this.tokens.delete(key);

    redis.eval(RELEASE_SCRIPT, 1, this.redisKey(key), token).catch((err) => {
      logger.error(`redis-mutex: release error for ${this.redisKey(key)}`, err);
    });
  }
}
