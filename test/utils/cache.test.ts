import { describe, expect, test, vi } from "vitest";

vi.mock("../../src/init/redis", () => ({
  default: {},
}));

vi.mock("../../src/utils/logger", () => ({
  logger: { error: vi.fn() },
}));

import { redisDeserialize, redisSerialize } from "../../src/utils/cache";

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
