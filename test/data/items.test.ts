import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { CarUpgradeType } from "#generated/prisma";
import { Item } from "../../src/types/Economy";
import { LootPool } from "../../src/types/LootPool";
import { WorkerUpgrades } from "../../src/types/Workers";
import Constants from "../../src/utils/Constants";
import {
  expectIdMatchesKey,
  expectNonEmptyString,
  expectPositiveInteger,
  expectPositiveNumber,
  expectUniqueStrings,
} from "./helpers";

const items: Record<string, Item> = JSON.parse(readFileSync("data/items.json").toString());
const lootPools: Record<string, LootPool> = JSON.parse(
  readFileSync("data/loot_pools.json").toString(),
);

const { upgrades }: { upgrades: Record<string, WorkerUpgrades> } = JSON.parse(
  readFileSync("data/workers.json").toString(),
);
const { plants } = JSON.parse(readFileSync("data/plants.json").toString());
const tags = JSON.parse(readFileSync("data/tags.json").toString());

const itemRoles = [
  "bakery-upgrade",
  "booster",
  "car",
  "car_part",
  "car_skin",
  "car_upgrade",
  "cat",
  "collectable",
  "crate",
  "currency",
  "farm-upgrade",
  "fish",
  "flower",
  "fuel",
  "item",
  "lottery ticket",
  "ore",
  "pet",
  "prey",
  "resource",
  "scratch-card",
  "seed",
  "sellable",
  "tag",
  "tool",
  "trophy",
  "worker-upgrade",
] as const;

for (const [id, item] of Object.entries(items)) {
  test(id, () => {
    expectIdMatchesKey(id, item);
    expectNonEmptyString(item.name, `${id}.name`);
    expect.soft(item.name).toBe(item.name.toLowerCase());
    expect.soft(typeof item.emoji).toBe("string");
    expect
      .soft(
        Constants.EMOJI_REGEX.test(item.emoji) || Constants.UNICODE_EMOJI_REGEX.test(item.emoji),
      )
      .toBe(true);
    expectNonEmptyString(item.longDesc, `${id}.longDesc`);
    expectNonEmptyString(item.article, `${id}.article`);
    expect.soft(typeof item.in_crates).toBe("boolean");
    expect.soft(item.role).toBeOneOf(itemRoles);
    expectNonEmptyString(item.plural, `${id}.plural`);
    if (typeof item.plural === "string") {
      expect.soft(item.plural).toBe(item.plural.toLowerCase());
    }

    if (item.role === "booster") {
      expect.soft(typeof item.stackable).toBe("boolean");
      if (item.stackable) {
        expectPositiveInteger(item.max, `${id}.max`);
      }
      expect(typeof item.boosterEffect).toBe("object");
      if (item.boosterEffect) {
        expect.soft(typeof item.boosterEffect.effect).toBe("number");
        expect.soft(item.boosterEffect.effect).toBeGreaterThanOrEqual(0);
        expectPositiveNumber(item.boosterEffect.time, `${id}.boosterEffect.time`);
        expect.soft(Array.isArray(item.boosterEffect.boosts)).toBe(true);
        expect.soft(item.boosterEffect.boosts.length).toBeGreaterThan(0);

        for (const effect of item.boosterEffect.boosts) {
          expectNonEmptyString(effect, `${id}.boosterEffect.boosts entry`);
        }

        if (item.boosterEffect.global !== undefined) {
          expect.soft(item.boosterEffect.global).toBe(true);
          expectPositiveInteger(
            item.boosterEffect.usesPerDabloon,
            `${id}.boosterEffect.usesPerDabloon`,
          );
        }
      }
    } else if (item.role === "scratch-card") {
      expectPositiveInteger(item.clicks, `${id}.clicks`);
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
    } else if (item.role === "tag") {
      expectNonEmptyString(item.tagId, `${id}.tagId`);
      expect.soft(tags[item.tagId!], `tag ${item.tagId} exists`).toBeDefined();
    } else if (item.role === "seed") {
      expectNonEmptyString(item.plantId, `${id}.plantId`);
      expect.soft(plants[item.plantId!], `plant ${item.plantId} exists`).toBeDefined();
    }

    if (item.role === "scratch-card" || item.role === "crate") {
      expect.soft(item.loot_pools, `${id}.loot_pools`).toBeTypeOf("object");
      expect.soft(Object.keys(item.loot_pools ?? {}).length).toBeGreaterThan(0);
      for (const poolKey in item.loot_pools) {
        expect.soft(typeof poolKey).toBe("string");
        expect.soft(lootPools[poolKey]).toBeDefined();
        expect.soft(Number(item.loot_pools[poolKey])).toBeGreaterThan(0);
      }
    }

    if (item.rarity !== undefined) {
      expect.soft(typeof item.rarity).toBe("number");
      expect.soft(Number.isFinite(item.rarity)).toBe(true);
      expect.soft(Number.isInteger(item.rarity)).toBe(true);
      expect(item.rarity).toBeGreaterThanOrEqual(0);
    }

    if (item.booster_desc !== undefined) {
      expectNonEmptyString(item.booster_desc, `${id}.booster_desc`);
    }
    if (item.booster_name !== undefined) {
      expectNonEmptyString(item.booster_name, `${id}.booster_name`);
      expect.soft(item.booster_name).toBe(item.booster_name.toLowerCase());
      expect.soft(item.role).toBe("booster");
    }
    if (item.shortDesc !== undefined) expectNonEmptyString(item.shortDesc, `${id}.shortDesc`);

    if (item.sell !== undefined) {
      expect.soft(typeof item.sell).toBe("number");
      expect.soft(Number.isFinite(item.sell)).toBe(true);
      expect.soft(item.sell).toBeGreaterThanOrEqual(0);
    }

    if (item.buy !== undefined) {
      expect.soft(typeof item.buy).toBe("number");
      expect.soft(Number.isFinite(item.buy)).toBe(true);
      expect.soft(item.buy).toBeGreaterThanOrEqual(0);

      if (item.buy > 0 && item.sell !== undefined) {
        expect.soft(item.buy).toBeGreaterThan(item.sell);
      }
    }

    if (item.aliases !== undefined) {
      expectUniqueStrings(item.aliases, `${id}.aliases`);
      for (const alias of item.aliases) {
        expect.soft(alias, `${id} alias should be lowercase`).toBe(alias.toLowerCase());
        expect.soft(alias, `${id} alias should not contain commas`).not.toContain(",");
      }
    }

    if (item.craft !== undefined) {
      expect.soft(typeof item.craft).toBe("object");
      expectPositiveNumber(item.craft.time, `${id}.craft.time`);
      expect.soft(Array.isArray(item.craft.ingredients)).toBe(true);
      expect.soft(item.craft.ingredients.length).toBeGreaterThan(0);

      for (const ingredient of item.craft.ingredients) {
        const match = /^([^:]+):([1-9]\d*)$/.exec(ingredient);
        expect.soft(match, `${id} has invalid ingredient "${ingredient}"`).not.toBeNull();
        if (!match) continue;
        expect.soft(items[match[1]], `ingredient item ${match[1]} exists`).toBeDefined();
        expectPositiveInteger(Number(match[2]), `${id} ingredient quantity`);
      }
    }

    if (item.unique !== undefined) expect.soft(item.unique).toBe(true);

    if (item.default_count !== undefined) {
      expectPositiveInteger(item.default_count, `${id}.default_count`);
      expect.soft(item.default_count).toBeGreaterThan(1);
    }
    if (item.account_locked !== undefined) expect.soft(item.account_locked).toBe(true);
    if (item.hidden !== undefined) expect.soft(item.hidden).toBe(true);
    if (item.upgrades !== undefined) {
      expect.soft(item.upgrades).toBeOneOf(Object.values(CarUpgradeType));
    }

    if (item.museum !== undefined) {
      expect(typeof item.museum).toBe("object");
      expect.soft(typeof item.museum.category).toBe("string");
      expect
        .soft(item.museum.category)
        .toBeOneOf([
          "boosters",
          "cars",
          "collectables",
          "general",
          "sellables",
          "tools",
          "gems",
          "cats",
          "flowers",
        ]);
      if (item.museum.no_overflow !== undefined) expect.soft(item.museum.no_overflow).toBe(true);
      expect.soft(typeof item.museum.threshold).toBe("number");
      expect.soft(item.museum.threshold).toBeGreaterThan(0);
    }
  });
}

test("visible item lookup values should resolve to only one item", () => {
  const owners = new Map<string, string>();

  for (const item of Object.values(items).filter((item) => !item.hidden)) {
    const lookupValues = [
      item.id,
      item.name,
      item.id.replaceAll("_", ""),
      item.name.replaceAll(" ", ""),
      item.plural,
      ...(item.aliases ?? []),
    ];

    for (const lookupValue of new Set(lookupValues)) {
      const owner = owners.get(lookupValue);
      expect
        .soft(owner, `"${lookupValue}" resolves to both ${owner} and ${item.id}`)
        .toBeUndefined();
      owners.set(lookupValue, item.id);
    }
  }
});
