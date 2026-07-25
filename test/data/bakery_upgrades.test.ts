import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { BakeryUpgradeData } from "../../src/types/Economy";
import Constants from "../../src/utils/Constants";
import {
  expectIdMatchesKey,
  expectNonEmptyString,
  expectPositiveInteger,
  expectPositiveNumber,
} from "./helpers";

const data: Record<string, BakeryUpgradeData> = JSON.parse(
  readFileSync("data/bakery_upgrades.json").toString(),
);

for (const [id, u] of Object.entries(data)) {
  test(id, () => {
    expectIdMatchesKey(id, u);
    expectNonEmptyString(u.name, `${id}.name`);
    expect.soft(typeof u.emoji).toBe("string");
    expect
      .soft(Constants.EMOJI_REGEX.test(u.emoji) || Constants.UNICODE_EMOJI_REGEX.test(u.emoji))
      .toBe(true);
    expect.soft(u.upgrades).toBeOneOf(["hourly", "bake", "maxafk", "cake"]);
    expectPositiveNumber(u.value, `${id}.value`);
    if (u.max !== undefined) {
      expectPositiveInteger(u.max, `${id}.max`);
    }
  });
}
