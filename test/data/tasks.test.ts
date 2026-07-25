import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { Item } from "../../src/types/Economy";
import { Task } from "../../src/types/Tasks";
import {
  expectIdMatchesKey,
  expectNonEmptyString,
  expectPositiveInteger,
  expectUniqueStrings,
} from "./helpers";

const data: Record<string, Task> = JSON.parse(readFileSync("data/tasks.json").toString());
const items: Record<string, Item> = JSON.parse(readFileSync("data/items.json").toString());

const urlRegex = /^https:\/\/[^\s]*$/;

for (const [id, t] of Object.entries(data)) {
  test(id, () => {
    expectIdMatchesKey(id, t);
    expectNonEmptyString(t.name, `${id}.name`);
    expectNonEmptyString(t.description, `${id}.description`);

    expect.soft(Array.isArray(t.target)).toBe(true);
    expect.soft(t.target.length, `${id}.target should not be empty`).toBeGreaterThan(0);

    for (const target of t.target) {
      expectPositiveInteger(target, `${id}.target`);
    }

    expect.soft(Array.isArray(t.prizes)).toBe(true);
    expect.soft(t.prizes.length, `${id}.prizes should not be empty`).toBeGreaterThan(0);

    for (const prize of t.prizes) {
      const itemMatch = /^id:([^:]+):([1-9]\d*)$/.exec(prize);
      const valueMatch = /^(money|karma|xp):([1-9]\d*)$/.exec(prize);

      if (itemMatch) {
        expect(items[itemMatch[1]], `item ${itemMatch[1]} exists`).toBeDefined();
        expectPositiveInteger(Number(itemMatch[2]), `${id} prize quantity`);
      } else {
        expect.soft(valueMatch, `${id} has invalid prize "${prize}"`).not.toBeNull();
        if (valueMatch) {
          expectPositiveInteger(Number(valueMatch[2]), `${id} prize amount`);
        }
      }
    }

    expect.soft(["daily", "weekly"].includes(t.type)).toBe(true);
    if (t.exclude !== undefined) {
      expectUniqueStrings(t.exclude, `${id}.exclude`);
    }
    if (t.complete_gif !== undefined) {
      expect.soft(typeof t.complete_gif).toBe("string");
      expect.soft(urlRegex.test(t.complete_gif)).toBe(true);
    }
  });
}
