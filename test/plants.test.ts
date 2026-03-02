import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { Plant, PlantUpgrade } from "../src/types/Economy";

const data = JSON.parse(readFileSync("data/plants.json").toString());

const plants: Record<string, Plant> = data.plants || {};
const upgrades: Record<string, PlantUpgrade> = data.upgrades || {};

for (const p of Object.values(plants)) {
  test(p.id, () => {
    expect.soft(typeof p.id).toBe("string");
    expect.soft(typeof p.name).toBe("string");
    expect.soft(typeof p.growthTime).toBe("number");
    expect.soft(typeof p.hourly).toBe("number");
    expect.soft(typeof p.max).toBe("number");
    expect.soft(typeof p.item).toBe("string");
    expect.soft(typeof p.type).toBe("string");
    expect.soft(typeof p.type_plural).toBe("string");
    expect.soft(typeof p.water.every).toBe("number");
    expect.soft(typeof p.water.dead).toBe("number");
    expect.soft(typeof p.fertilise.every).toBe("number");
    expect.soft(typeof p.fertilise.dead).toBe("number");
  });
}

for (const u of Object.values(upgrades)) {
  test(u.id, () => {
    expect.soft(typeof u.id).toBe("string");
    expect.soft(typeof u.name).toBe("string");
    expect.soft(typeof u.upgrades).toBe("string");
    expect.soft(typeof u.effect).toBe("number");
  });
}
