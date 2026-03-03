import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { Item } from "../src/types/Economy";
import { KarmaShopItem } from "../src/types/Karmashop";
import Constants from "../src/utils/Constants";

const data: Record<string, KarmaShopItem> = JSON.parse(
  readFileSync("data/karmashop.json").toString(),
);

const items: Record<string, Item> = JSON.parse(readFileSync("data/items.json").toString());

for (const k of Object.values(data)) {
  test(k.id, () => {
    expect.soft(typeof k.id).toBe("string");
    expect.soft(typeof k.name).toBe("string");
    expect.soft(typeof k.emoji).toBe("string");
    expect
      .soft(Constants.EMOJI_REGEX.test(k.emoji) || Constants.UNICODE_EMOJI_REGEX.test(k.emoji))
      .toBe(true);
    expect.soft(typeof k.cost).toBe("number");
    expect.soft(typeof k.items_left).toBe("number");
    if (k.aliases) expect.soft(Array.isArray(k.aliases)).toBe(true);
    expect.soft(["item", "premium", "xp"].includes(k.type)).toBe(true);

    if (k.type === "item") {
      expect.soft(typeof k.value).toBe("string");
      expect.soft(items[k.value]).toBeDefined();
    } else if (k.type === "premium") {
      expect.soft(k.value).toBeOneOf(["bronze_credit", "silver_credit", "gold_credit"]);
    } else {
      expect.soft(typeof k.value).toBe("number");
      expect.soft(k.value).toBeGreaterThan(0);
    }

    expect.soft(k.value !== undefined).toBe(true);
    expect.soft(typeof k.limit).toBe("number");
  });
}
