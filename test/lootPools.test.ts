import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { Item } from "../src/types/Economy";
import { LootPool } from "../src/types/LootPool";

const items: Record<string, Item> = JSON.parse(readFileSync("data/items.json").toString());
const lootPools: Record<string, LootPool> = JSON.parse(
  readFileSync("data/loot_pools.json").toString(),
);

for (const poolId in lootPools) {
  test(poolId, () => {
    const pool = lootPools[poolId];
    if (pool.nothing) {
      expect(Number(pool.nothing)).toBeGreaterThan(0);
    }
    for (const amount in pool.money) {
      expect(Number(amount)).toBeGreaterThan(0);
      expect(Number(pool.money[amount])).toBeGreaterThan(0);
    }
    for (const amount in pool.xp) {
      expect(Number(amount)).toBeGreaterThan(0);
      expect(Number(pool.xp[amount])).toBeGreaterThan(0);
    }
    for (const amount in pool.karma) {
      expect(Number(amount)).toBeGreaterThan(0);
      expect(Number(pool.karma[amount])).toBeGreaterThan(0);
    }
    for (const itemKey in pool.items) {
      const itemValue = pool.items[itemKey];
      expect(items[itemKey]).toBeDefined();
      if (typeof itemValue === "number") {
        expect(Number(itemValue)).toBeGreaterThan(0);
      }
      if (typeof itemValue === "object" && itemValue.weight) {
        expect(Number(itemValue.weight)).toBeGreaterThan(0);
      }
    }
  });
}
