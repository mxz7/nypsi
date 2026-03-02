import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { Task } from "../src/types/Tasks";

const data: Record<string, Task> = JSON.parse(readFileSync("data/tasks.json").toString());

for (const t of Object.values(data)) {
  test(t.id, () => {
    expect.soft(typeof t.id).toBe("string");
    expect.soft(typeof t.name).toBe("string");
    expect.soft(typeof t.description).toBe("string");
    expect.soft(Array.isArray(t.target)).toBe(true);
    expect.soft(Array.isArray(t.prizes)).toBe(true);
    expect.soft(["daily", "weekly"].includes(t.type)).toBe(true);
    if (t.exclude) expect.soft(Array.isArray(t.exclude)).toBe(true);
    if (t.complete_gif) expect.soft(typeof t.complete_gif).toBe("string");
  });
}
