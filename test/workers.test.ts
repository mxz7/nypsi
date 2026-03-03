import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { Worker, WorkerUpgrades } from "../src/types/Workers";
import Constants from "../src/utils/Constants";

const data = JSON.parse(readFileSync("data/workers.json").toString());

const upgrades: Record<string, WorkerUpgrades> = data.upgrades;
const workers: Record<string, Worker> = data.workers;

test("upgrades and workers should be defined", () => {
  expect(upgrades).toBeDefined();
  expect(workers).toBeDefined();
});

for (const u of Object.values(upgrades)) {
  test(u.id, () => {
    expect.soft(typeof u.id).toBe("string");
    expect.soft(typeof u.name).toBe("string");
    expect.soft(typeof u.upgrades).toBe("string");
    expect.soft(typeof u.effect).toBe("number");
    expect.soft(u.effect).toBeGreaterThan(0);
    expect.soft(typeof u.stack_limit).toBe("number");
    expect.soft(u.stack_limit).toBeGreaterThan(0);
  });
}

for (const w of Object.values(workers)) {
  test(w.id, () => {
    expect.soft(typeof w.id).toBe("string");
    expect.soft(typeof w.name).toBe("string");
    expect.soft(typeof w.item_emoji).toBe("string");
    expect
      .soft(
        Constants.EMOJI_REGEX.test(w.item_emoji) ||
          Constants.UNICODE_EMOJI_REGEX.test(w.item_emoji),
      )
      .toBe(true);
    expect.soft(typeof w.prestige_requirement).toBe("number");
    expect.soft(w.prestige_requirement).toBeGreaterThan(0);
    expect.soft(typeof w.cost).toBe("number");
    expect.soft(w.cost).toBeGreaterThan(0);
    expect.soft(typeof w.base.per_item).toBe("number");
    expect.soft(w.base.per_item).toBeGreaterThan(0);
    expect.soft(typeof w.base.max_storage).toBe("number");
    expect.soft(w.base.max_storage).toBeGreaterThan(0);
    expect.soft(typeof w.base.per_interval).toBe("number");
    expect.soft(w.base.per_interval).toBeGreaterThan(0);
    if (w.base.byproducts) {
      for (const bp of Object.values(w.base.byproducts)) {
        expect.soft(typeof bp.chance).toBe("number");
        expect.soft(bp.chance).toBeGreaterThan(0);
        expect.soft(typeof bp.rolls).toBe("number");
        expect.soft(bp.rolls).toBeGreaterThan(0);
        expect.soft(typeof bp.multiply_chance).toBe("boolean");
        expect.soft(typeof bp.multiply_rolls).toBe("boolean");
      }
    }
  });
}
