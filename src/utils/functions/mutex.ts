import redis from "../../init/redis";
import { logger } from "../logger";
import sleep from "./sleep";

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
  private locks = new Map<string | undefined, { acquiredAt: number; token: string }>();

  /**
   * @param prefix        - lock key namespace, used directly when acquire/release omit a key
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

  private redisKey(key?: string): string {
    return key === undefined ? this.prefix : `${this.prefix}:${key}`;
  }

  private async acquireOnce(key: string | undefined, requestedAt: number): Promise<boolean> {
    const token = crypto.randomUUID();
    const redisKey = this.redisKey(key);
    const result = await redis.set(redisKey, token, "PX", this.ttl, "NX");

    if (result !== "OK") return false;

    const acquiredAt = Date.now();

    this.locks.set(key, { acquiredAt, token });
    if (this.shouldLog) {
      logger.debug(`redis-mutex: acquired ${redisKey}`, {
        redisKey,
        waitMs: acquiredAt - requestedAt,
      });
    }

    return true;
  }

  async tryAcquire(key?: string): Promise<boolean> {
    const redisKey = this.redisKey(key);
    const requestedAt = Date.now();

    if (this.shouldLog) {
      logger.debug(`redis-mutex: requested ${redisKey}`);
    }

    return this.acquireOnce(key, requestedAt);
  }

  async acquire(key?: string): Promise<void> {
    const redisKey = this.redisKey(key);
    const requestedAt = Date.now();

    if (this.shouldLog) {
      logger.debug(`redis-mutex: requested ${redisKey}`);
    }

    while (!(await this.acquireOnce(key, requestedAt))) {
      await sleep(this.pollInterval);
    }
  }

  release(key?: string): void {
    const lock = this.locks.get(key);
    if (!lock) return;

    const redisKey = this.redisKey(key);

    this.locks.delete(key);

    redis
      .eval(RELEASE_SCRIPT, 1, redisKey, lock.token)
      .then((result) => {
        if (this.shouldLog) {
          logger.debug(`redis-mutex: released ${redisKey}`, {
            heldMs: Date.now() - lock.acquiredAt,
            redisKey,
            released: result === 1,
          });
        }
      })
      .catch((err) => {
        logger.error(`redis-mutex: release error for ${redisKey}`, err);
      });
  }
}
