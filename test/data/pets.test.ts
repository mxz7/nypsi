import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { Item, PetData, PetTarget } from "../../src/types/Economy";

const pets: Record<string, PetData> = JSON.parse(readFileSync("data/pets.json").toString());
const items: Record<string, Item> = JSON.parse(readFileSync("data/items.json").toString());
const supportedTargets: PetTarget[] = ["farm", "fish", "hunt", "mine"];
const requiredPets = ["cow", "beaver", "tiger", "mole"];

test("pet configuration", () => {
  const itemIds = new Set<string>();

  for (const [id, pet] of Object.entries(pets)) {
    expect.soft(typeof pet.item, `${id}.item`).toBe("string");
    expect.soft(items[pet.item], `${id}.item references an economy item`).toBeDefined();
    expect.soft(supportedTargets, `${id}.target is supported`).toContain(pet.target);
    expect.soft(typeof pet.description, `${id}.description`).toBe("string");
    expect.soft(pet.description.length, `${id}.description has a value`).toBeGreaterThan(0);
    expect
      .soft(pet.description, `${id}.description has a chance placeholder`)
      .toContain("{chance}");
    if (pet.target === "farm") {
      expect
        .soft(pet.description, `${id}.description has a bonus placeholder`)
        .toContain("{bonus}");
    }

    expect.soft(Array.isArray(pet.chance), `${id}.chance`).toBe(true);
    expect.soft(Array.isArray(pet.benefit), `${id}.benefit`).toBe(true);
    expect.soft(Array.isArray(pet.items), `${id}.items`).toBe(true);
    expect.soft(pet.chance.length, `${id}.chance has values`).toBeGreaterThan(0);
    expect.soft(pet.benefit.length, `${id}.benefit has values`).toBeGreaterThan(0);
    expect.soft(pet.items.length, `${id}.items has values`).toBeGreaterThan(0);
    expect.soft(pet.benefit.length, `${id} benefit/chance lengths`).toBe(pet.chance.length);
    expect.soft(pet.items.length, `${id} items/chance lengths`).toBe(pet.chance.length);

    for (const chance of pet.chance) {
      expect.soft(typeof chance, `${id}.chance entry`).toBe("number");
      expect.soft(chance, `${id}.chance entry`).toBeGreaterThanOrEqual(0);
      expect.soft(chance, `${id}.chance entry`).toBeLessThanOrEqual(1);
    }

    for (const benefit of pet.benefit) {
      expect.soft(typeof benefit, `${id}.benefit entry`).toBe("number");
      expect.soft(benefit, `${id}.benefit entry`).toBeGreaterThan(0);
    }

    for (const amount of pet.items) {
      expect.soft(Number.isInteger(amount), `${id}.items entry`).toBe(true);
      expect.soft(amount, `${id}.items entry`).toBeGreaterThan(0);
    }

    expect.soft(itemIds.has(pet.item), `${id}.item is unique`).toBe(false);
    itemIds.add(pet.item);
  }

  expect.soft(Object.keys(pets).sort()).toEqual(requiredPets.sort());
});
