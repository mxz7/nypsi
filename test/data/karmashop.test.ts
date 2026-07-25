import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { Item } from "../../src/types/Economy";
import { KarmaShopItem } from "../../src/types/Karmashop";
import Constants from "../../src/utils/Constants";
import {
  expectIdMatchesKey,
  expectNonEmptyString,
  expectPositiveInteger,
  expectUniqueStrings,
} from "./helpers";

const data: Record<string, Omit<KarmaShopItem, "bought">> = JSON.parse(
  readFileSync("data/karmashop.json").toString(),
);

const items: Record<string, Item> = JSON.parse(readFileSync("data/items.json").toString());

for (const [id, k] of Object.entries(data)) {
  test(id, () => {
    expectIdMatchesKey(id, k);
    expectNonEmptyString(k.name, `${id}.name`);
    expect.soft(typeof k.emoji).toBe("string");
    expect
      .soft(Constants.EMOJI_REGEX.test(k.emoji) || Constants.UNICODE_EMOJI_REGEX.test(k.emoji))
      .toBe(true);
    expectPositiveInteger(k.cost, `${id}.cost`);
    expectPositiveInteger(k.items_left, `${id}.items_left`);
    if (k.aliases !== undefined) expectUniqueStrings(k.aliases, `${id}.aliases`);
    expect.soft(["item", "premium", "xp"].includes(k.type)).toBe(true);

    if (k.type === "item") {
      expectNonEmptyString(k.value, `${id}.value`);
      expect.soft(items[k.value]).toBeDefined();
    } else if (k.type === "premium") {
      expect.soft(k.value).toBeOneOf(["bronze_credit", "silver_credit", "gold_credit"]);
    } else {
      expectPositiveInteger(k.value, `${id}.value`);
    }

    expect.soft(k.value !== undefined).toBe(true);
    expectPositiveInteger(k.limit, `${id}.limit`);
  });
}
