import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { Item } from "../src/types/Economy";
import { Task } from "../src/types/Tasks";

const data: Record<string, Task> = JSON.parse(readFileSync("data/tasks.json").toString());
const items: Record<string, Item> = JSON.parse(readFileSync("data/items.json").toString());

const urlRegex = /^https:\/\/[^\s]*$/;

for (const t of Object.values(data)) {
  test(t.id, () => {
    expect.soft(typeof t.id).toBe("string");
    expect.soft(typeof t.name).toBe("string");
    expect.soft(typeof t.description).toBe("string");

    expect.soft(Array.isArray(t.target)).toBe(true);

    for (const target of t.target) {
      expect.soft(typeof target).toBe("number");
      expect.soft(target).toBeGreaterThan(0);
    }

    expect.soft(Array.isArray(t.prizes)).toBe(true);

    for (const prize of t.prizes) {
      const split = prize.split(":");
      if (split[0] === "id") {
        expect(typeof split[1]).toBe("string");
        expect(items[split[1]]).toBeDefined();
        expect(parseInt(split[2])).toBeGreaterThan(0);
      } else {
        expect.soft(split[0]).toBeOneOf(["karma", "xp"]);
        expect.soft(parseInt(split[1])).toBeGreaterThan(0);
      }
    }

    expect.soft(["daily", "weekly"].includes(t.type)).toBe(true);
    if (t.exclude) expect.soft(Array.isArray(t.exclude)).toBe(true);
    if (t.complete_gif) {
      expect.soft(typeof t.complete_gif).toBe("string");
      expect.soft(urlRegex.test(t.complete_gif)).toBe(true);
    }
  });
}
