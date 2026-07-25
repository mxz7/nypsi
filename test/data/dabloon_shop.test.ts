import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { DabloonShopItem, Item } from "../../src/types/Economy";
import { expectPositiveInteger } from "./helpers";

const data: Record<string, DabloonShopItem> = JSON.parse(
  readFileSync("data/dabloon_shop.json").toString(),
);
const items: Record<string, Item> = JSON.parse(readFileSync("data/items.json").toString());

for (const [itemId, it] of Object.entries(data)) {
  test(itemId, () => {
    expect.soft(it.itemId).toBe(itemId);
    expectPositiveInteger(it.cost, `${itemId}.cost`);
    expect.soft(items[it.itemId]).toBeDefined();
  });
}
