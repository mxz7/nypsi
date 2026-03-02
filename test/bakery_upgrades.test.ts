import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { BakeryUpgradeData } from "../src/types/Economy";
import Constants from "../src/utils/Constants";

const data: Record<string, BakeryUpgradeData> = JSON.parse(
  readFileSync("data/bakery_upgrades.json").toString(),
);

for (const u of Object.values(data)) {
  test(u.id, () => {
    expect.soft(typeof u.id).toBe("string");
    expect.soft(typeof u.name).toBe("string");
    expect.soft(typeof u.emoji).toBe("string");
    expect
      .soft(Constants.EMOJI_REGEX.test(u.emoji) || Constants.UNICODE_EMOJI_REGEX.test(u.emoji))
      .toBe(true);
    expect.soft(typeof u.upgrades).toBe("string");
    expect.soft(typeof u.value).toBe("number");
    if (u.max !== undefined) {
      expect.soft(typeof u.max).toBe("number");
      expect.soft(u.max).toBeGreaterThan(0);
    }
  });
}
