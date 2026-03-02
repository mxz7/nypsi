import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { DabloonShopItem } from "../src/types/Economy";

const data: Record<string, DabloonShopItem> = JSON.parse(
  readFileSync("data/dabloon_shop.json").toString(),
);

for (const it of Object.values(data)) {
  test(it.itemId, () => {
    expect.soft(typeof it.itemId).toBe("string");
    expect.soft(typeof it.cost).toBe("number");
  });
}
