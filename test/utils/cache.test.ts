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
  logger: { error: loggerError },
}));

import { MapCache, RedisCache, redisDeserialize, redisSerialize } from "../../src/utils/cache";

afterEach(() => {
  vi.useRealTimers();
  resetRedisMock(redisMock);
  vi.clearAllMocks();
});

describe("Redis cache serialization", () => {
  test("round-trips nested BigInt values", () => {
    const value = {
      id: 123n,
      nested: { balances: [0n, 999_999_999_999n] },
      text: "123",
    };

    expect(redisDeserialize(redisSerialize(value))).toEqual(value);
  });

  test("leaves ordinary numbers and numeric strings unchanged", () => {
    const value = { number: 123, string: "456", nullable: null };

    expect(redisDeserialize(redisSerialize(value))).toEqual(value);
  });

  test("serializes a top-level BigInt", () => {
    expect(redisDeserialize<bigint>(redisSerialize(42n))).toBe(42n);
  });

  test("throws for malformed serialized data", () => {
    expect(() => redisDeserialize("not-json")).toThrow();
  });
});

describe("RedisCache", () => {
  test("normalizes keys and deserializes cached values", async () => {
    redisMock.get.mockResolvedValue(redisSerialize({ balance: 42n }));
    const cache = new RedisCache<{ balance: bigint }>("balance", 60);

    await expect(cache.get("User-ID")).resolves.toEqual({ balance: 42n });
    expect(redisMock.get).toHaveBeenCalledWith("balance:user-id");
  });

  test("returns null for a cache miss", async () => {
    redisMock.get.mockResolvedValue(null);
    const cache = new RedisCache("profile", 60);

    await expect(cache.get("user")).resolves.toBeNull();
  });

  test("uses the default TTL and supports a per-entry override", async () => {
    redisMock.set.mockResolvedValue("OK");
    const cache = new RedisCache<{ id: bigint }>("profile", 60);

    await cache.set("USER", { id: 1n });
    await cache.set("OTHER", { id: 2n }, 5);

    expect(redisMock.set).toHaveBeenNthCalledWith(
      1,
      "profile:user",
      redisSerialize({ id: 1n }),
      "EX",
      60,
    );
    expect(redisMock.set).toHaveBeenNthCalledWith(
      2,
      "profile:other",
      redisSerialize({ id: 2n }),
      "EX",
      5,
    );
  });

  test("returns null and logs malformed cached values", async () => {
    redisMock.get.mockResolvedValue("{malformed");
    const cache = new RedisCache("profile", 60);

    await expect(cache.get("user")).resolves.toBeNull();
    expect(loggerError).toHaveBeenCalledWith(
      "redis-cache: failed to parse cached data",
      expect.objectContaining({ key: "profile", arg: "user", error: expect.any(Error) }),
    );
  });

  test("logs serialization or Redis write failures without rejecting", async () => {
    const error = new Error("write failed");
    redisMock.set.mockRejectedValue(error);
    const cache = new RedisCache("profile", 60);

    await expect(cache.set("user", { id: 1 })).resolves.toBeUndefined();
    expect(loggerError).toHaveBeenCalledWith("redis-cache: failed to set cached data", {
      key: "profile",
      arg: "user",
      error,
    });
  });
});

describe("MapCache", () => {
  test("stores independent keys and returns null for missing keys", () => {
    vi.useFakeTimers();
    const cache = new MapCache<number>(60);

    cache.set("first", 1);
    cache.set("second", 2);

    expect(cache.get("first")).toBe(1);
    expect(cache.get("second")).toBe(2);
    expect(cache.get("missing")).toBeNull();
  });

  test("expires values at the configured TTL boundary", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const cache = new MapCache<string>(10);
    cache.set("key", "value");

    vi.setSystemTime(10_999);
    expect(cache.get("key")).toBe("value");

    vi.setSystemTime(11_000);
    expect(cache.get("key")).toBeNull();
  });

  test("supports per-entry TTLs and resets expiry when overwritten", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const cache = new MapCache<string>(60);
    cache.set("key", "first", 5);

    vi.setSystemTime(5_000);
    cache.set("key", "second", 10);
    vi.setSystemTime(11_000);
    expect(cache.get("key")).toBe("second");

    vi.setSystemTime(15_000);
    expect(cache.get("key")).toBeNull();
  });

  test("deletes entries by prefix", () => {
    vi.useFakeTimers();
    const cache = new MapCache<number>(60);
    cache.set("guild-1:first", 1);
    cache.set("guild-1:second", 2);
    cache.set("guild-2:first", 3);

    cache.deleteByPrefix("guild-1:");

    expect(cache.get("guild-1:first")).toBeNull();
    expect(cache.get("guild-1:second")).toBeNull();
    expect(cache.get("guild-2:first")).toBe(3);
  });

  test("clears all entries", () => {
    vi.useFakeTimers();
    const cache = new MapCache<number>(60);
    cache.set("first", 1);
    cache.set("second", 2);

    cache.clear();

    expect(cache.get("first")).toBeNull();
    expect(cache.get("second")).toBeNull();
  });
});
