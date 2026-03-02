import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { Item } from "../src/types/Economy";
import { LootPool } from "../src/types/LootPool";
import Constants from "../src/utils/Constants";

const items: Record<string, Item> = JSON.parse(readFileSync("data/items.json").toString());
const lootPools: Record<string, LootPool> = JSON.parse(
  readFileSync("data/loot_pools.json").toString(),
);

for (const item of Object.values(items)) {
  test(item.id, () => {
    expect.soft(typeof item.id).toBe("string");
    expect.soft(typeof item.name).toBe("string");
    expect.soft(typeof item.emoji).toBe("string");
    expect
      .soft(
        Constants.EMOJI_REGEX.test(item.emoji) || Constants.UNICODE_EMOJI_REGEX.test(item.emoji),
      )
      .toBe(true);
    expect.soft(typeof item.longDesc).toBe("string");
    expect.soft(typeof item.article).toBe("string");
    expect.soft(typeof item.in_crates).toBe("boolean");
    expect.soft(typeof item.role).toBe("string");

    if (item.role === "booster") {
      expect.soft(typeof item.stackable).toBe("boolean");
      if (item.stackable) expect.soft(typeof item.max).toBe("number");
      expect.soft(typeof item.boosterEffect).toBe("object");
      expect.soft(typeof item.boosterEffect.effect).toBe("number");
      expect.soft(typeof item.boosterEffect.time).toBe("number");

      expect.soft(Array.isArray(item.boosterEffect.boosts)).toBe(true);

      for (const effect of item.boosterEffect.boosts) {
        expect.soft(typeof effect).toBe("string");
      }
    } else if (item.role === "scratch-card") {
      expect.soft(typeof item.clicks).toBe("number");
    } else if (item.role === "car") expect.soft(typeof item.speed).toBe("number");
    else if (item.role === "ore") expect.soft(typeof item.ingot).toBe("string");
    else if (item.role === "worker-upgrade")
      expect.soft(typeof item.worker_upgrade_id).toBe("string");
    else if (item.role === "tag") expect.soft(typeof item.tagId).toBe("string");

    if (item.role === "scratch-card" || item.role === "crate") {
      for (const poolKey in item.loot_pools) {
        expect.soft(typeof poolKey).toBe("string");
        expect.soft(lootPools[poolKey]).toBeDefined();
        expect.soft(Number(item.loot_pools[poolKey])).toBeGreaterThan(0);
      }
    }

    if (item.rarity) expect.soft(typeof item.rarity).toBe("number");
    if (item.booster_desc) expect.soft(typeof item.booster_desc).toBe("string");
    if (item.shortDesc) expect.soft(typeof item.shortDesc).toBe("string");
    if (item.buy) expect.soft(typeof item.buy).toBe("number");
    if (item.sell) expect.soft(typeof item.sell).toBe("number");
    if (item.aliases) expect.soft(Array.isArray(item.aliases)).toBe(true);
    if (item.plural) expect.soft(typeof item.plural).toBe("string");

    if (item.craft) {
      expect.soft(typeof item.craft).toBe("object");
      expect.soft(typeof item.craft.time).toBe("number");
      expect.soft(Array.isArray(item.craft.ingredients)).toBe(true);

      for (const ingredient of item.craft.ingredients) {
        expect.soft(Boolean(items[ingredient.split(":")[0]])).toBe(true);
        expect.soft(Number(ingredient.split(":")[1])).toBeGreaterThan(0);
      }
    }

    if (item.plantId !== undefined) expect.soft(typeof item.plantId).toBe("string");
    if (item.unique !== undefined) expect.soft(item.unique).toBe(true);

    if (item.default_count !== undefined) expect.soft(typeof item.default_count).toBe("number");
    if (item.account_locked !== undefined) expect.soft(item.account_locked).toBe(true);
    if (item.hidden !== undefined) expect.soft(item.hidden).toBe(true);
    if (item.upgrades) expect.soft(typeof item.upgrades).toBe("string");

    if (item.boosterEffect && item.boosterEffect.global !== undefined) {
      expect.soft(typeof item.boosterEffect.global).toBe("boolean");
    }
  });
}
