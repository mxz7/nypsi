import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { Item } from "../src/types/Economy";
import { LootPool } from "../src/types/LootPool";
import { WorkerUpgrades } from "../src/types/Workers";
import Constants from "../src/utils/Constants";

const items: Record<string, Item> = JSON.parse(readFileSync("data/items.json").toString());
const lootPools: Record<string, LootPool> = JSON.parse(
  readFileSync("data/loot_pools.json").toString(),
);

const { upgrades }: { upgrades: Record<string, WorkerUpgrades> } = JSON.parse(
  readFileSync("data/workers.json").toString(),
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
      if (item.stackable) {
        expect.soft(typeof item.max).toBe("number");
        expect.soft(item.max).toBeGreaterThan(0);
      }
      expect(typeof item.boosterEffect).toBe("object");
      if (item.boosterEffect) {
        expect.soft(typeof item.boosterEffect.effect).toBe("number");
        expect.soft(item.boosterEffect.effect).toBeGreaterThanOrEqual(0);
        expect.soft(typeof item.boosterEffect.time).toBe("number");
        expect.soft(item.boosterEffect.time).toBeGreaterThan(0);
        expect.soft(Array.isArray(item.boosterEffect.boosts)).toBe(true);

        for (const effect of item.boosterEffect.boosts) {
          expect.soft(typeof effect).toBe("string");
        }

        if (item.boosterEffect.global !== undefined) {
          expect.soft(item.boosterEffect.global).toBe(true);
        }
      }
    } else if (item.role === "scratch-card") {
      expect.soft(typeof item.clicks).toBe("number");
      expect.soft(item.clicks).toBeGreaterThanOrEqual(3);
    } else if (item.role === "car") {
      expect.soft(typeof item.speed).toBe("number");
      expect.soft(item.speed).toBeGreaterThanOrEqual(0);
    } else if (item.role === "ore") {
      expect.soft(typeof item.ingot).toBe("string");
      expect(items[item.ingot!]).toBeDefined();
    } else if (item.role === "worker-upgrade") {
      expect(typeof item.worker_upgrade_id).toBe("string");
      expect.soft(upgrades[item.worker_upgrade_id!]).toBeDefined();
    } else if (item.role === "tag") expect.soft(typeof item.tagId).toBe("string");

    if (item.role === "scratch-card" || item.role === "crate") {
      for (const poolKey in item.loot_pools) {
        expect.soft(typeof poolKey).toBe("string");
        expect.soft(lootPools[poolKey]).toBeDefined();
        expect.soft(Number(item.loot_pools[poolKey])).toBeGreaterThan(0);
      }
    }

    if (item.rarity !== undefined) {
      expect.soft(typeof item.rarity).toBe("number");
      expect(item.rarity).toBeGreaterThanOrEqual(0);
    }

    if (item.booster_desc) expect.soft(typeof item.booster_desc).toBe("string");
    if (item.shortDesc) expect.soft(typeof item.shortDesc).toBe("string");

    if (item.sell) {
      expect.soft(typeof item.sell).toBe("number");
      expect.soft(item.sell).toBeGreaterThan(0);
    }

    if (item.buy) {
      expect.soft(typeof item.buy).toBe("number");
      expect.soft(item.buy).toBeGreaterThan(0);

      if (item.sell) {
        expect.soft(item.buy).toBeGreaterThan(item.sell);
      }
    }

    if (item.aliases) {
      expect.soft(Array.isArray(item.aliases)).toBe(true);

      for (const alias of item.aliases) {
        expect.soft(typeof alias).toBe("string");

        const itemValues = Object.values(items);

        const sameNameOrId = itemValues.find(
          (i) => (i.name === alias || i.id === alias) && i.id !== item.id,
        );
        expect(sameNameOrId).toBe(undefined);

        const sameAlias = itemValues.find((i) => i.aliases?.includes(alias) && i.id !== item.id);

        expect(sameAlias).toBe(undefined);
      }
    }
    if (item.plural) expect.soft(typeof item.plural).toBe("string");

    if (item.craft) {
      expect.soft(typeof item.craft).toBe("object");
      expect.soft(typeof item.craft.time).toBe("number");
      expect.soft(item.craft.time).toBeGreaterThan(0);
      expect.soft(Array.isArray(item.craft.ingredients)).toBe(true);

      for (const ingredient of item.craft.ingredients) {
        expect.soft(Boolean(items[ingredient.split(":")[0]])).toBe(true);
        expect.soft(Number(ingredient.split(":")[1])).toBeGreaterThan(0);
      }
    }

    if (item.plantId !== undefined) expect.soft(typeof item.plantId).toBe("string");
    if (item.unique !== undefined) expect.soft(item.unique).toBe(true);

    if (item.default_count !== undefined) {
      expect.soft(typeof item.default_count).toBe("number");
      expect.soft(item.default_count).toBeGreaterThan(1);
    }
    if (item.account_locked !== undefined) expect.soft(item.account_locked).toBe(true);
    if (item.hidden !== undefined) expect.soft(item.hidden).toBe(true);
    if (item.upgrades) expect.soft(typeof item.upgrades).toBe("string");

    if (item.museum) {
      expect(typeof item.museum).toBe("object");
      expect.soft(typeof item.museum.category).toBe("string");
      expect
        .soft(item.museum.category)
        .toBeOneOf(["boosters", "cars", "collectables", "general", "sellables", "tools"]);
      if (item.museum.no_overflow !== undefined) expect.soft(item.museum.no_overflow).toBe(true);
      expect.soft(typeof item.museum.threshold).toBe("number");
      expect.soft(item.museum.threshold).toBeGreaterThan(0);
    }
  });
}
