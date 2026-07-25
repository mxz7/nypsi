import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { AchievementData } from "../../src/types/Economy";
import Constants from "../../src/utils/Constants";
import { expectIdMatchesKey, expectNonEmptyString, expectPositiveInteger } from "./helpers";

const data: Record<string, AchievementData> = JSON.parse(
  readFileSync("data/achievements.json").toString(),
);

// load reference data used for prize validation
const items: Record<string, unknown> = JSON.parse(readFileSync("data/items.json").toString());
const tags: Record<string, unknown> = JSON.parse(readFileSync("data/tags.json").toString());

for (const [id, ach] of Object.entries(data)) {
  test(id, () => {
    expectIdMatchesKey(id, ach);
    expectNonEmptyString(ach.name, `${id}.name`);
    expect.soft(typeof ach.emoji).toBe("string");
    expect
      .soft(Constants.EMOJI_REGEX.test(ach.emoji) || Constants.UNICODE_EMOJI_REGEX.test(ach.emoji))
      .toBe(true);
    expectPositiveInteger(ach.target, `${id}.target`);
    expectNonEmptyString(ach.description, `${id}.description`);

    if (ach.prize !== undefined) {
      expect(Array.isArray(ach.prize)).toBe(true);
      expect.soft(ach.prize.length, `${id}.prize should not be empty`).toBeGreaterThan(0);

      for (const p of ach.prize) {
        expectNonEmptyString(p, `${id}.prize entry`);
        const tagMatch = /^tag:([^:]+)$/.exec(p);
        const itemMatch = /^([^:]+):([1-9]\d*)$/.exec(p);

        if (tagMatch) {
          const tagName = tagMatch[1];
          expect.soft(tags[tagName], `tag ${tagName} exists`).toBeDefined();
        } else {
          expect.soft(itemMatch, `${id} has invalid prize "${p}"`).not.toBeNull();
          if (!itemMatch) continue;
          const [, itemName, qtyStr] = itemMatch;
          expect.soft(items[itemName], `item ${itemName} exists`).toBeDefined();
          expectPositiveInteger(Number(qtyStr), `${id} prize quantity`);
        }
      }
    }
  });
}
