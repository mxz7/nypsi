import { describe, expect, test, vi } from "vitest";

vi.mock("../../src/init/redis", () => ({
  default: {},
}));

vi.mock("../../src/utils/logger", () => ({
  logger: { debug: vi.fn(), error: vi.fn() },
}));

import { MemoryMutex } from "../../src/utils/functions/mutex";

describe("MemoryMutex", () => {
  test("waits for the current holder to release a key", async () => {
    const mutex = new MemoryMutex();
    await mutex.acquire("account");

    let acquired = false;
    const waiting = mutex.acquire("account").then(() => {
      acquired = true;
    });
    await Promise.resolve();
    expect(acquired).toBe(false);

    mutex.release("account");
    await waiting;
    expect(acquired).toBe(true);
    mutex.release("account");
  });

  test("grants queued acquisitions in FIFO order", async () => {
    const mutex = new MemoryMutex();
    const order: number[] = [];
    await mutex.acquire("account");

    const second = mutex.acquire("account").then(() => order.push(2));
    const third = mutex.acquire("account").then(() => order.push(3));

    mutex.release("account");
    await second;
    expect(order).toEqual([2]);

    mutex.release("account");
    await third;
    expect(order).toEqual([2, 3]);
    mutex.release("account");
  });

  test("allows different keys to be acquired independently", async () => {
    const mutex = new MemoryMutex();
    await mutex.acquire("first");

    await expect(mutex.acquire("second")).resolves.toBeUndefined();

    mutex.release("first");
    mutex.release("second");
  });

  test("ignores release calls for unknown keys", () => {
    const mutex = new MemoryMutex();

    expect(() => mutex.release("missing")).not.toThrow();
  });
});
