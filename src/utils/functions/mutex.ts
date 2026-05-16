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
