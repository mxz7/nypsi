import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { Item } from "../../src/types/Economy";
import { LootPool } from "../../src/types/LootPool";
import { expectPositiveInteger, expectPositiveNumber } from "./helpers";

const items: Record<string, Item> = JSON.parse(readFileSync("data/items.json").toString());
const lootPools: Record<string, LootPool> = JSON.parse(
  readFileSync("data/loot_pools.json").toString(),
);
const generatedPools = new Set(["basic_crate", "workers_crate", "boosters_crate", "pandora_box"]);

for (const [poolId, pool] of Object.entries(lootPools)) {
  test(poolId, () => {
    expect
      .soft(
        Object.keys(pool).every((key) =>
          ["nothing", "money", "xp", "karma", "items"].includes(key),
        ),
      )
      .toBe(true);

    if (pool.nothing !== undefined) {
      expectPositiveNumber(pool.nothing, `${poolId}.nothing`);
    }

    for (const [amount, weight] of Object.entries(pool.money ?? {})) {
      expectPositiveInteger(Number(amount), `${poolId}.money amount`);
      expectPositiveNumber(weight, `${poolId}.money.${amount} weight`);
    }
    for (const [amount, weight] of Object.entries(pool.xp ?? {})) {
      expectPositiveInteger(Number(amount), `${poolId}.xp amount`);
      expectPositiveNumber(weight, `${poolId}.xp.${amount} weight`);
    }
    for (const [amount, weight] of Object.entries(pool.karma ?? {})) {
      expectPositiveInteger(Number(amount), `${poolId}.karma amount`);
      expectPositiveNumber(weight, `${poolId}.karma.${amount} weight`);
    }

    for (const [itemKey, itemValue] of Object.entries(pool.items ?? {})) {
      expect.soft(items[itemKey]).toBeDefined();
      expect.soft(typeof itemValue).toBeOneOf(["number", "object"]);

      if (typeof itemValue === "number") {
        expectPositiveNumber(itemValue, `${poolId}.items.${itemKey} weight`);
      } else if (itemValue !== null) {
        expect
          .soft(Object.keys(itemValue).every((key) => ["weight", "count"].includes(key)))
          .toBe(true);

        if (itemValue.weight !== undefined) {
          expectPositiveNumber(itemValue.weight, `${poolId}.items.${itemKey}.weight`);
        }

        if (itemValue.count !== undefined) {
          expect.soft(typeof itemValue.count).toBeOneOf(["number", "object"]);

          if (typeof itemValue.count === "number") {
            expectPositiveInteger(itemValue.count, `${poolId}.items.${itemKey}.count`);
          } else if (itemValue.count !== null) {
            expect.soft(Object.keys(itemValue.count).sort()).toEqual(["max", "min"]);
            expectPositiveInteger(itemValue.count.min, `${poolId}.items.${itemKey}.count.min`);
            expectPositiveInteger(itemValue.count.max, `${poolId}.items.${itemKey}.count.max`);
            expect.soft(itemValue.count.max).toBeGreaterThanOrEqual(itemValue.count.min);
          }
        }
      }
    }

    if (generatedPools.has(poolId)) {
      expect.soft(pool).toEqual({});
    } else {
      const entryCount =
        Number(pool.nothing !== undefined) +
        Object.keys(pool.money ?? {}).length +
        Object.keys(pool.xp ?? {}).length +
        Object.keys(pool.karma ?? {}).length +
        Object.keys(pool.items ?? {}).length;
      expect.soft(entryCount, `${poolId} should contain at least one outcome`).toBeGreaterThan(0);
    }
  });
}
