import { afterEach, describe, expect, test, vi } from "vitest";
import { percentChance, randomRound, shuffle } from "../../src/utils/functions/random";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("shuffle", () => {
  test("returns a permutation without mutating the input", () => {
    const input = [1, 2, 3, 4, 5];

    const result = shuffle(input);

    expect(result).not.toBe(input);
    expect(result.toSorted()).toEqual(input);
    expect(input).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("percentChance", () => {
  test("never succeeds for a non-positive percentage", () => {
    const random = vi.spyOn(Math, "random");

    expect(percentChance(0)).toBe(false);
    expect(percentChance(-10)).toBe(false);
    expect(random).not.toHaveBeenCalled();
  });

  test("uses the expected inclusive boundary for whole percentages", () => {
    vi.spyOn(Math, "random").mockReturnValueOnce(0.49).mockReturnValueOnce(0.5);

    expect(percentChance(50)).toBe(true);
    expect(percentChance(50)).toBe(false);
  });

  test("preserves decimal precision when calculating chance", () => {
    vi.spyOn(Math, "random").mockReturnValueOnce(0.012).mockReturnValueOnce(0.013);

    expect(percentChance(1.3)).toBe(true);
    expect(percentChance(1.3)).toBe(false);
  });

  test("always succeeds at one hundred percent", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.999_999);

    expect(percentChance(100)).toBe(true);
  });
});

describe("randomRound", () => {
  test("rounds up when the random value is below the fractional part", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.24);

    expect(randomRound(4.25)).toBe(5);
  });

  test("rounds down when the random value reaches the fractional part", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.25);

    expect(randomRound(4.25)).toBe(4);
  });
});
