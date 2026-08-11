import { describe, expect, it } from "vitest";
import {
  getSuperdrawChance,
  getSuperdrawChanceMultiplier,
} from "../../src/utils/functions/economy/superdraw";

describe("superdraw rollover tickets", () => {
  it("preserves small-holder rewards", () => {
    expect(getSuperdrawChance(1)).toBe(0.1);
    expect(getSuperdrawChance(10)).toBeCloseTo(0.09965, 5);
    expect(getSuperdrawChance(25)).toBeCloseTo(0.096, 5);
    expect(getSuperdrawChance(100)).toBeCloseTo(0.06607, 5);
    expect(getSuperdrawChance(250)).toBeCloseTo(0.04513, 5);
  });

  it("decreases continuously without a floor", () => {
    const ticketAmounts = [1, 10, 100, 500, 1_000, 2_000, 5_000, 10_000, 1_000_000];
    const chances = ticketAmounts.map(getSuperdrawChance);

    for (let i = 1; i < chances.length; i++) {
      expect(chances[i]).toBeLessThan(chances[i - 1]);
    }

    expect(getSuperdrawChance(1_000)).toBeCloseTo(0.025);
    expect(getSuperdrawChance(2_000)).toBeCloseTo(0.0186, 4);
    expect(getSuperdrawChance(10_000)).toBeCloseTo(0.00937, 5);
    expect(getSuperdrawChance(1_000_000)).toBeCloseTo(0.00132, 5);
  });

  it("does not scale the whale-heavy example below the expected ticket ceiling", () => {
    const amounts = [
      1_782_986, 241_391, 25_010, 5_181, 5_000, 3_289, 3_009, 1_022, 1_009, 1_001, 1_000,
    ];
    const expectedTickets = amounts.reduce(
      (total, amount) => total + amount * getSuperdrawChance(amount),
      0,
    );

    expect(getSuperdrawChanceMultiplier(amounts)).toBe(1);
    expect(expectedTickets).toBeCloseTo(2_900.67, 2);
  });

  it("scales small-holder-heavy draws to 5,000 expected tickets", () => {
    const amounts = Array<number>(1_000).fill(100);
    const multiplier = getSuperdrawChanceMultiplier(amounts);
    const expectedTickets = amounts.reduce(
      (total, amount) => total + amount * getSuperdrawChance(amount) * multiplier,
      0,
    );

    expect(multiplier).toBeLessThan(1);
    expect(expectedTickets).toBeCloseTo(5_000);
  });
});
