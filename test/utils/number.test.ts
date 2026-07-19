import { describe, expect, test } from "vitest";
import { formatNumber, formatNumberPretty } from "../../src/utils/functions/economy/number";

describe("formatNumber", () => {
  test.each([
    ["1,234", 1_234],
    ["1.5k", 1_500],
    ["2.75M", 2_750_000],
    ["1.25b", 1_250_000_000],
    [42.9, 42],
    ["-1.2k", -1_200],
  ])("parses %s as %d", (input, expected) => {
    expect(formatNumber(input)).toBe(expected);
  });

  test.each(["", "not-a-number", "k", "--5"])("rejects %j", (input) => {
    expect(formatNumber(input)).toBeNull();
  });

  test("uses the first recognised magnitude suffix", () => {
    expect(formatNumber("2km")).toBe(2_000_000);
  });
});

describe("formatNumberPretty", () => {
  test.each([
    [999, "999"],
    [1_000, "1k"],
    [1_250, "1.3k"],
    [1_000_000, "1m"],
    [1_250_000_000, "1.3b"],
    [1_000_000_000_000, "1t"],
  ])("formats %d as %s", (input, expected) => {
    expect(formatNumberPretty(input)).toBe(expected);
  });

  test("rounds values that cross the next display threshold", () => {
    expect(formatNumberPretty(999_999)).toBe("1000k");
  });
});
