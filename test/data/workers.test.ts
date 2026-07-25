import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { Item } from "../../src/types/Economy";
import { Worker, WorkerUpgrades } from "../../src/types/Workers";
import Constants from "../../src/utils/Constants";
import {
  expectIdMatchesKey,
  expectNonEmptyString,
  expectPositiveInteger,
  expectPositiveNumber,
} from "./helpers";

const data = JSON.parse(readFileSync("data/workers.json").toString());

const upgrades: Record<string, WorkerUpgrades> = data.upgrades;
const workers: Record<string, Worker> = data.workers;
const items: Record<string, Item> = JSON.parse(readFileSync("data/items.json").toString());
const possibleUpgrades = [
  "per_item",
  "per_interval",
  "max_storage",
  "byproduct_chance",
  "byproduct_rolls",
] as const;

test("upgrades and workers should be defined", () => {
  expect(upgrades).toBeDefined();
  expect(workers).toBeDefined();
});

for (const [id, u] of Object.entries(upgrades)) {
  test(id, () => {
    expectIdMatchesKey(id, u);
    expectNonEmptyString(u.name, `${id}.name`);
    if (u.plural !== undefined) expectNonEmptyString(u.plural, `${id}.plural`);
    expect.soft(u.upgrades).toBeOneOf(possibleUpgrades);
    expectPositiveNumber(u.effect, `${id}.effect`);
    expectPositiveInteger(u.stack_limit, `${id}.stack_limit`);
    if (u.base_cost !== undefined) expectPositiveInteger(u.base_cost, `${id}.base_cost`);
    if (u.for !== undefined) {
      expectNonEmptyString(u.for, `${id}.for`);
      expect.soft(workers[u.for], `worker ${u.for} exists`).toBeDefined();
    }
    if (u.byproduct !== undefined) {
      expectNonEmptyString(u.byproduct, `${id}.byproduct`);
      expect.soft(items[u.byproduct], `item ${u.byproduct} exists`).toBeDefined();
      expect.soft(u.for, `${id} byproduct upgrade should target a worker`).toBeDefined();
      if (u.for !== undefined) {
        expect
          .soft(
            workers[u.for]?.base.byproducts?.[u.byproduct],
            `${u.byproduct} is a ${u.for} byproduct`,
          )
          .toBeDefined();
      }
    }
    if (u.upgrades === "byproduct_chance" || u.upgrades === "byproduct_rolls") {
      expect.soft(u.byproduct).toBeDefined();
    }
  });
}

for (const [id, w] of Object.entries(workers)) {
  test(id, () => {
    expectIdMatchesKey(id, w);
    expectNonEmptyString(w.name, `${id}.name`);
    expect.soft(typeof w.item_emoji).toBe("string");
    expect
      .soft(
        Constants.EMOJI_REGEX.test(w.item_emoji) ||
          Constants.UNICODE_EMOJI_REGEX.test(w.item_emoji),
      )
      .toBe(true);
    expectPositiveInteger(w.prestige_requirement, `${id}.prestige_requirement`);
    expectPositiveInteger(w.cost, `${id}.cost`);
    expectPositiveNumber(w.base.per_item, `${id}.base.per_item`);
    expectPositiveInteger(w.base.max_storage, `${id}.base.max_storage`);
    expectPositiveInteger(w.base.per_interval, `${id}.base.per_interval`);
    if (w.base.byproducts !== undefined) {
      for (const [itemId, bp] of Object.entries(w.base.byproducts)) {
        expect.soft(items[itemId], `item ${itemId} exists`).toBeDefined();
        expectPositiveNumber(bp.chance, `${id}.base.byproducts.${itemId}.chance`);
        expect.soft(bp.chance).toBeLessThanOrEqual(1);
        expectPositiveNumber(bp.rolls, `${id}.base.byproducts.${itemId}.rolls`);
        expect.soft(typeof bp.multiply_chance).toBe("boolean");
        expect.soft(typeof bp.multiply_rolls).toBe("boolean");
      }
    }
  });
}
