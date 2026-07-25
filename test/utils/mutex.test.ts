import { afterEach, describe, expect, test, vi } from "vitest";
import { resetRedisMock } from "../mocks/redis";

const { loggerError, redisMock } = await vi.hoisted(async () => {
  const { createRedisMock } = await import("../mocks/redis");

  return {
    loggerError: vi.fn(),
    redisMock: createRedisMock(),
  };
});

vi.mock("../../src/init/redis", () => ({ default: redisMock }));

vi.mock("../../src/utils/logger", () => ({
  logger: { debug: vi.fn(), error: loggerError },
}));

import { MemoryMutex, RedisMutex } from "../../src/utils/functions/mutex";

afterEach(() => {
  vi.useRealTimers();
  resetRedisMock(redisMock);
  vi.clearAllMocks();
});

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

describe("RedisMutex", () => {
  test("acquires a namespaced lock with a unique token and TTL", async () => {
    redisMock.set.mockResolvedValue("OK");
    const mutex = new RedisMutex("economy", false, 1_500, 25);

    await mutex.acquire("user");

    expect(redisMock.set).toHaveBeenCalledOnce();
    const [key, token, px, ttl, nx] = redisMock.set.mock.calls[0];
    expect(key).toBe("mutex:economy:user");
    expect(token).toEqual(expect.any(String));
    expect(token).not.toBe("");
    expect([px, ttl, nx]).toEqual(["PX", 1_500, "NX"]);
  });

  test("polls until Redis grants the lock", async () => {
    vi.useFakeTimers();
    redisMock.set
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce("OK");
    const mutex = new RedisMutex("economy", false, 1_000, 50);

    const acquiring = mutex.acquire("user");
    await vi.advanceTimersByTimeAsync(100);
    await acquiring;

    expect(redisMock.set).toHaveBeenCalledTimes(3);
  });

  test("releases only its own token and only once", async () => {
    redisMock.set.mockResolvedValue("OK");
    redisMock.eval.mockResolvedValue(1);
    const mutex = new RedisMutex("economy");
    await mutex.acquire("user");
    const token = redisMock.set.mock.calls[0][1];

    mutex.release("user");
    await vi.waitFor(() => expect(redisMock.eval).toHaveBeenCalledOnce());

    expect(redisMock.eval).toHaveBeenCalledWith(
      expect.stringContaining("redis.call('get', KEYS[1]) == ARGV[1]"),
      1,
      "mutex:economy:user",
      token,
    );

    mutex.release("user");
    expect(redisMock.eval).toHaveBeenCalledOnce();
  });

  test("ignores release calls for keys it does not own", () => {
    const mutex = new RedisMutex("economy");

    expect(() => mutex.release("missing")).not.toThrow();
    expect(redisMock.eval).not.toHaveBeenCalled();
  });

  test("logs Redis release failures", async () => {
    const error = new Error("release failed");
    redisMock.set.mockResolvedValue("OK");
    redisMock.eval.mockRejectedValue(error);
    const mutex = new RedisMutex("economy");
    await mutex.acquire("user");

    mutex.release("user");

    await vi.waitFor(() =>
      expect(loggerError).toHaveBeenCalledWith(
        "redis-mutex: release error for mutex:economy:user",
        error,
      ),
    );
  });
});
