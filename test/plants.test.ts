import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { Item, Plant, PlantUpgrade } from "../src/types/Economy";

const data = JSON.parse(readFileSync("data/plants.json").toString());

const plants: Record<string, Plant> = data.plants || {};
const upgrades: Record<string, PlantUpgrade> = data.upgrades || {};

const items: Record<string, Item> = JSON.parse(readFileSync("data/items.json").toString());

for (const p of Object.values(plants)) {
  test(p.id, () => {
    expect.soft(typeof p.id).toBe("string");
    expect.soft(typeof p.name).toBe("string");
    expect.soft(typeof p.growthTime).toBe("number");
    expect.soft(p.growthTime).toBeGreaterThan(0);
    expect.soft(typeof p.hourly).toBe("number");
    expect.soft(p.hourly).toBeGreaterThan(0);
    expect.soft(typeof p.max).toBe("number");
    expect.soft(p.max).toBeGreaterThan(0);
    expect.soft(typeof p.item).toBe("string");
    expect.soft(typeof p.type).toBe("string");
    expect.soft(typeof p.type_plural).toBe("string");
    expect.soft(typeof p.water.every).toBe("number");
    expect.soft(p.water.every).toBeGreaterThan(0);
    expect.soft(typeof p.water.dead).toBe("number");
    expect.soft(p.water.dead).toBeGreaterThan(0);
    expect.soft(typeof p.fertilise.every).toBe("number");
    expect.soft(p.fertilise.every).toBeGreaterThan(0);
    expect.soft(typeof p.fertilise.dead).toBe("number");
    expect.soft(p.fertilise.dead).toBeGreaterThan(0);
  });
}

for (const u of Object.values(upgrades)) {
  test(u.id, () => {
    expect.soft(typeof u.id).toBe("string");
    expect.soft(typeof u.name).toBe("string");
    expect.soft(typeof u.upgrades).toBe("string");
    expect.soft(typeof u.effect).toBe("number");
    expect.soft(u.effect).toBeGreaterThan(0);

    expect(Boolean(u.type_single || u.type_upgradable)).toBe(true);

    if (u.type_single) {
      expect.soft(typeof u.type_single).toBe("object");
      expect.soft(u.type_upgradable).toBeUndefined();
      expect.soft(typeof u.type_single.item).toBe("string");
      expect.soft(typeof u.type_single.stack_limit).toBe("number");

      expect.soft(items[u.type_single.item]).toBeDefined();
    }

    if (u.type_upgradable) {
      expect.soft(u.type_single).toBeUndefined();
      expect.soft(typeof u.type_upgradable).toBe("object");
      expect.soft(Array.isArray(u.type_upgradable.items)).toBe(true);

      for (const item of u.type_upgradable.items) {
        expect.soft(typeof item).toBe("string");
        expect(items[item]).toBeDefined();
      }
    }
  });
}
