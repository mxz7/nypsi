import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { KarmaShopItem } from "../src/types/Karmashop";

const data: Record<string, KarmaShopItem> = JSON.parse(
  readFileSync("data/karmashop.json").toString(),
);

for (const k of Object.values(data)) {
  test(k.id, () => {
    expect.soft(typeof k.id).toBe("string");
    expect.soft(typeof k.name).toBe("string");
    expect.soft(typeof k.emoji).toBe("string");
    expect.soft(typeof k.cost).toBe("number");
    expect.soft(typeof k.items_left).toBe("number");
    if (k.aliases) expect.soft(Array.isArray(k.aliases)).toBe(true);
    expect.soft(["item", "premium", "xp"].includes(k.type)).toBe(true);
    expect.soft(k.value !== undefined).toBe(true);
    expect.soft(typeof k.limit).toBe("number");
  });
}
