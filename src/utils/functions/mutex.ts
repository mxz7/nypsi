export class Mutex {
  private locked = false;
  private waiting: (() => void)[] = [];

  async acquire(): Promise<() => void> {
    return new Promise<() => void>((resolve) => {
      const tryAcquire = () => {
        if (!this.locked) {
          this.locked = true;
          resolve(this.release.bind(this));
        } else {
          this.waiting.push(tryAcquire);
        }
      };
      tryAcquire();
    });
  }

  private release() {
    if (this.waiting.length > 0) {
      const next = this.waiting.shift();
      if (next) next();
    } else {
      this.locked = false;
    }
  }
}
