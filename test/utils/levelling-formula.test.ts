import { describe, expect, test } from "vitest";
import { calculateLevelXp } from "../../src/utils/functions/economy/levelling-formula";

const calculatePrestigeXp = (prestige: number) => {
  let total = 0;

  for (let level = 0; level < 100; level++) {
    total += calculateLevelXp(prestige * 100 + level);
  }

  return total;
};

describe("levelling XP formula", () => {
  test("matches the agreed early, midgame, and high-prestige checkpoints", () => {
    expect(calculateLevelXp(0)).toBe(50);
    expect(calculateLevelXp(500)).toBe(394);
    expect(calculateLevelXp(2_000)).toBe(2_286);
    expect(calculateLevelXp(5_000)).toBe(6_126);
    expect(calculateLevelXp(8_000)).toBe(19_544);
    expect(calculateLevelXp(15_000)).toBe(79_195);
    expect(calculateLevelXp(20_000)).toBe(139_534);
  });

  test("preserves the early-prestige level reset", () => {
    expect(calculateLevelXp(100)).toBeLessThan(calculateLevelXp(99));
  });

  test("matches the cumulative P20 and P80 balance targets", () => {
    let totalToP20 = 0;
    let totalToP80 = 0;

    for (let rawLevel = 0; rawLevel < 8_000; rawLevel++) {
      const requiredXp = calculateLevelXp(rawLevel);

      if (rawLevel < 2_000) totalToP20 += requiredXp;
      totalToP80 += requiredXp;
    }

    expect(totalToP20).toBe(2_154_413);
    expect(totalToP80).toBe(49_895_800);
  });

  test("keeps prestige costs and their increases monotonic", () => {
    let previousCost = calculatePrestigeXp(0);
    let previousIncrease = 0;

    for (let prestige = 1; prestige <= 200; prestige++) {
      const cost = calculatePrestigeXp(prestige);
      const increase = cost - previousCost;

      expect(cost).toBeGreaterThan(previousCost);
      expect(increase).toBeGreaterThanOrEqual(previousIncrease);

      previousCost = cost;
      previousIncrease = increase;
    }
  });
});
