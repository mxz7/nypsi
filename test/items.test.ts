import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { Item } from "../src/types/Economy";
import { LootPool } from "../src/types/LootPool";

const items: Record<string, Item> = JSON.parse(readFileSync("data/items.json").toString());
const lootPools: Record<string, LootPool> = JSON.parse(
  readFileSync("data/loot_pools.json").toString(),
);

for (const item of Object.values(items)) {
  test(item.id, () => {
    expect(typeof item.id).toBe("string");
    expect(typeof item.name).toBe("string");
    expect(typeof item.emoji).toBe("string");
    expect(typeof item.longDesc).toBe("string");
    expect(typeof item.article).toBe("string");
    expect(typeof item.in_crates).toBe("boolean");
    expect(typeof item.role).toBe("string");

    if (item.role === "booster") {
      expect(typeof item.stackable).toBe("boolean");
      if (item.stackable) expect(typeof item.max).toBe("number");
      expect(typeof item.boosterEffect).toBe("object");
      expect(typeof item.boosterEffect.effect).toBe("number");
      expect(typeof item.boosterEffect.time).toBe("number");

      expect(Array.isArray(item.boosterEffect.boosts)).toBe(true);

      for (const effect of item.boosterEffect.boosts) {
        expect(typeof effect).toBe("string");
      }
    } else if (item.role === "scratch-card") {
      expect(typeof item.clicks).toBe("number");
    } else if (item.role === "car") expect(typeof item.speed).toBe("number");
    else if (item.role === "ore") expect(typeof item.ingot).toBe("string");
    else if (item.role === "worker-upgrade") expect(typeof item.worker_upgrade_id).toBe("string");
    else if (item.role === "tag") expect(typeof item.tagId).toBe("string");

    if (item.role === "scratch-card" || item.role === "crate") {
      for (const poolKey in item.loot_pools) {
        expect(typeof poolKey).toBe("string");
        expect(lootPools[poolKey]).toBeDefined();
        expect(Number(item.loot_pools[poolKey])).toBeGreaterThan(0);
      }
    }

    if (item.rarity) expect(typeof item.rarity).toBe("number");
    if (item.booster_desc) expect(typeof item.booster_desc).toBe("string");
    if (item.shortDesc) expect(typeof item.shortDesc).toBe("string");
    if (item.buy) expect(typeof item.buy).toBe("number");
    if (item.sell) expect(typeof item.sell).toBe("number");
    if (item.aliases) expect(Array.isArray(item.aliases)).toBe(true);
    if (item.plural) expect(typeof item.plural).toBe("string");

    if (item.craft) {
      expect(typeof item.craft).toBe("object");
      expect(typeof item.craft.time).toBe("number");
      expect(Array.isArray(item.craft.ingredients)).toBe(true);

      for (const ingredient of item.craft.ingredients) {
        expect(Boolean(items[ingredient.split(":")[0]])).toBe(true);
        expect(Number(ingredient.split(":")[1])).toBeGreaterThan(0);
      }
    }
  });
}
