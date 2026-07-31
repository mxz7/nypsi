import { describe, expect, test } from "vitest";
import {
  calculateLevelXp,
  cratesFormula,
  moneyFormula,
} from "../../src/utils/functions/economy/levelling-formula";

const calculatePrestigeXp = (prestige: number) => {
  let total = 0;

  for (let level = 0; level < 100; level++) {
    total += calculateLevelXp(prestige * 100 + level);
  }

  return total;
};

const calculatePrestigeMoney = (prestige: number) => {
  let total = 0;

  for (let level = 0; level < 100; level++) {
    total += moneyFormula(prestige * 100 + level);
  }

  return total;
};

describe("levelling XP formula", () => {
  test("matches the agreed early, midgame, and high-prestige checkpoints", () => {
    expect(calculateLevelXp(0)).toBe(50);
    expect(calculateLevelXp(500)).toBe(394);
    expect(calculateLevelXp(2_000)).toBe(2_286);
    expect(calculateLevelXp(5_000)).toBe(6_358);
    expect(calculateLevelXp(8_000)).toBe(19_906);
    expect(calculateLevelXp(15_000)).toBe(79_445);
    expect(calculateLevelXp(20_000)).toBe(139_784);
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
    expect(totalToP80).toBe(51_261_903);
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

describe("levelling money formula", () => {
  test("matches the agreed early, midgame, and high-prestige checkpoints", () => {
    expect(moneyFormula(0)).toBe(9_999);
    expect(moneyFormula(500)).toBe(314_456);
    expect(moneyFormula(2_000)).toBe(5_853_292);
    expect(moneyFormula(5_000)).toBe(46_341_904);
    expect(moneyFormula(8_000)).toBe(133_460_914);
    expect(moneyFormula(15_000)).toBe(521_584_877);
    expect(moneyFormula(20_000)).toBe(961_444_010);
  });

  test("matches the agreed P25 and P80 prestige costs", () => {
    expect(calculatePrestigeMoney(25)).toBe(1_001_924_740);
    expect(calculatePrestigeMoney(80)).toBe(13_529_664_704);
  });

  test("matches the cumulative P30 and P80 balance targets", () => {
    let totalToP30 = 0;
    let totalToP80 = 0;

    for (let rawLevel = 0; rawLevel < 8_000; rawLevel++) {
      const requiredMoney = moneyFormula(rawLevel);

      if (rawLevel < 3_000) totalToP30 += requiredMoney;
      totalToP80 += requiredMoney;
    }

    expect(totalToP30).toBe(13_486_547_108);
    expect(totalToP80).toBe(328_664_327_825);
  });

  test("keeps prestige costs and their increases monotonic", () => {
    let previousCost = calculatePrestigeMoney(0);
    let previousIncrease = 0;

    for (let prestige = 1; prestige <= 200; prestige++) {
      const cost = calculatePrestigeMoney(prestige);
      const increase = cost - previousCost;

      expect(cost).toBeGreaterThan(previousCost);
      expect(increase).toBeGreaterThanOrEqual(previousIncrease);

      previousCost = cost;
      previousIncrease = increase;
    }
  });
});

describe("levelling crate formula", () => {
  test("uses the configured reward intervals", () => {
    expect(cratesFormula(29)).toBe(0);
    expect(cratesFormula(30)).toBe(1);
    expect(cratesFormula(1_515)).toBe(0);
    expect(cratesFormula(1_525)).toBeGreaterThan(0);
    expect(cratesFormula(3_015)).toBe(0);
    expect(cratesFormula(3_020)).toBeGreaterThan(0);
    expect(cratesFormula(4_005)).toBeGreaterThan(0);
  });

  test("matches the smoothed prestige checkpoints", () => {
    expect(cratesFormula(90)).toBe(1);
    expect(cratesFormula(1_500)).toBe(6);
    expect(cratesFormula(2_000)).toBe(7);
    expect(cratesFormula(4_005)).toBe(11);
    expect(cratesFormula(6_000)).toBe(19);
    expect(cratesFormula(7_500)).toBe(29);
    expect(cratesFormula(8_010)).toBe(30);
  });

  test("keeps rewards monotonic through P200", () => {
    let previousReward = 0;

    for (let rawLevel = 1; rawLevel < 20_000; rawLevel++) {
      const crates = cratesFormula(rawLevel);

      if (crates === 0) continue;

      expect(crates).toBeGreaterThanOrEqual(previousReward);
      previousReward = crates;
    }
  });

  test("keeps cumulative supply close to the previous P80 total", () => {
    let totalCrates = 0;

    for (let rawLevel = 1; rawLevel < 8_000; rawLevel++) {
      totalCrates += cratesFormula(rawLevel);
    }

    expect(totalCrates).toBe(6_293);
  });
});
