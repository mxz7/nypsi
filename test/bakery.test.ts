import { describe, expect, test } from "vitest";
import { applyPassiveBakePenalty } from "../src/utils/functions/economy/bakery-range";

describe("passive bakery penalty", () => {
  test("preserves the random range for an upgraded bakery", () => {
    const range = applyPassiveBakePenalty(47, 63);

    expect(range).toEqual([30, 46]);
    expect(range[1] - range[0]).toBe(16);
  });

  test("does not reduce either bound below one", () => {
    expect(applyPassiveBakePenalty(1, 3)).toEqual([1, 1]);
  });
});
