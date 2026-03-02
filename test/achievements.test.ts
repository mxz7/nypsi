import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { AchievementData } from "../src/types/Economy";
import Constants from "../src/utils/Constants";

const data: Record<string, AchievementData> = JSON.parse(
  readFileSync("data/achievements.json").toString(),
);

// load reference data used for prize validation
const items: Record<string, unknown> = JSON.parse(readFileSync("data/items.json").toString());
const tags: Record<string, unknown> = JSON.parse(readFileSync("data/tags.json").toString());

for (const ach of Object.values(data)) {
  test(ach.id, () => {
    expect.soft(typeof ach.id).toBe("string");
    expect.soft(typeof ach.name).toBe("string");
    expect.soft(typeof ach.emoji).toBe("string");
    expect
      .soft(Constants.EMOJI_REGEX.test(ach.emoji) || Constants.UNICODE_EMOJI_REGEX.test(ach.emoji))
      .toBe(true);
    expect.soft(typeof ach.target).toBe("number");
    expect.soft(typeof ach.description).toBe("string");

    if (ach.prize) {
      expect(Array.isArray(ach.prize)).toBe(true);

      // each prize entry should either be a valid item with quantity or a tag
      for (const p of ach.prize) {
        expect.soft(typeof p).toBe("string");

        if (p.startsWith("tag:")) {
          // tags are prefixed with tag:<id>
          const parts = p.split(":");
          expect.soft(parts.length).toBe(2);
          const tagName = parts[1];
          expect.soft(tags[tagName], `tag ${tagName} exists`).toBeDefined();
        } else {
          const parts = p.split(":");
          expect.soft(parts.length).toBe(2);
          const [itemName, qtyStr] = parts;
          expect.soft(items[itemName], `item ${itemName} exists`).toBeDefined();
          const qty = parseInt(qtyStr, 10);
          expect.soft(!isNaN(qty) && qty > 0).toBe(true);
        }
      }
    }
  });
}
