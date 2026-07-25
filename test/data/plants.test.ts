import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { Item, Plant, PlantUpgrade } from "../../src/types/Economy";
import {
  expectIdMatchesKey,
  expectNonEmptyString,
  expectPositiveInteger,
  expectPositiveNumber,
  expectUniqueStrings,
} from "./helpers";

const data = JSON.parse(readFileSync("data/plants.json").toString());

const plants: Record<string, Plant> = data.plants || {};
const upgrades: Record<string, PlantUpgrade> = data.upgrades || {};

const items: Record<string, Item> = JSON.parse(readFileSync("data/items.json").toString());

for (const [id, p] of Object.entries(plants)) {
  test(id, () => {
    expectIdMatchesKey(id, p);
    expectNonEmptyString(p.name, `${id}.name`);
    expectPositiveInteger(p.growthTime, `${id}.growthTime`);
    expectPositiveNumber(p.hourly, `${id}.hourly`);
    expectPositiveInteger(p.max, `${id}.max`);
    expectNonEmptyString(p.item, `${id}.item`);
    expect.soft(items[p.item], `item ${p.item} exists`).toBeDefined();
    expectNonEmptyString(p.type, `${id}.type`);
    expectNonEmptyString(p.type_plural, `${id}.type_plural`);
    expectPositiveInteger(p.water.every, `${id}.water.every`);
    expectPositiveInteger(p.water.dead, `${id}.water.dead`);
    expect.soft(p.water.dead).toBeGreaterThan(p.water.every);
    expectPositiveInteger(p.fertilise.every, `${id}.fertilise.every`);
    expectPositiveInteger(p.fertilise.dead, `${id}.fertilise.dead`);
    expect.soft(p.fertilise.dead).toBeGreaterThan(p.fertilise.every);
  });
}

for (const [id, u] of Object.entries(upgrades)) {
  test(id, () => {
    expectIdMatchesKey(id, u);
    expectNonEmptyString(u.name, `${id}.name`);
    expectNonEmptyString(u.plural, `${id}.plural`);
    expect.soft(u.upgrades).toBeOneOf(["interval", "max_storage"]);
    expectPositiveNumber(u.effect, `${id}.effect`);

    expect
      .soft(Number(u.type_single !== undefined) + Number(u.type_upgradable !== undefined))
      .toBe(1);

    if (u.for !== undefined) {
      expectUniqueStrings(u.for, `${id}.for`);
      for (const plantId of u.for) {
        expect.soft(plants[plantId], `plant ${plantId} exists`).toBeDefined();
      }
    }

    if (u.type_single !== undefined) {
      expect.soft(typeof u.type_single).toBe("object");
      expect.soft(u.type_upgradable).toBeUndefined();
      expectNonEmptyString(u.type_single.item, `${id}.type_single.item`);
      expectPositiveInteger(u.type_single.stack_limit, `${id}.type_single.stack_limit`);
      expect.soft(items[u.type_single.item]).toBeDefined();
    }

    if (u.type_upgradable !== undefined) {
      expect.soft(u.type_single).toBeUndefined();
      expect.soft(typeof u.type_upgradable).toBe("object");
      expectUniqueStrings(u.type_upgradable.items, `${id}.type_upgradable.items`);
      expect.soft(u.type_upgradable.items.length).toBeGreaterThan(0);

      for (const item of u.type_upgradable.items) {
        expect(items[item]).toBeDefined();
      }
    }
  });
}
