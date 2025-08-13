import { logger } from "../logger";

export class Mutex {
  private locks = new Map<string, { locked: boolean; queue: (() => void)[] }>();

  async acquire(key: string): Promise<void> {
    logger.debug(`mutex: acquire ${key}`);
    if (!this.locks.has(key)) {
      this.locks.set(key, { locked: false, queue: [] });
    }

    const lock = this.locks.get(key)!;

    if (!lock.locked) {
      lock.locked = true;
      return;
    }

    return new Promise((resolve) => {
      lock.queue.push(resolve);
    });
  }

  release(key: string): void {
    logger.debug(`mutex: release ${key}`);
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
