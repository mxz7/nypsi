import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { DabloonShopItem, Item } from "../src/types/Economy";

const data: Record<string, DabloonShopItem> = JSON.parse(
  readFileSync("data/dabloon_shop.json").toString(),
);
const items: Record<string, Item> = JSON.parse(readFileSync("data/items.json").toString());

for (const it of Object.values(data)) {
  test(it.itemId, () => {
    expect.soft(typeof it.itemId).toBe("string");
    expect.soft(typeof it.cost).toBe("number");
    expect.soft(it.cost).toBeGreaterThan(50);
    expect.soft(items[it.itemId]).toBeDefined();
  });
}
