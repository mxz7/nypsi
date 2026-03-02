import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { UserUpgrade } from "../src/types/Economy";

const data: Record<string, UserUpgrade> = JSON.parse(readFileSync("data/upgrades.json").toString());

for (const u of Object.values(data)) {
  test(u.id, () => {
    expect.soft(typeof u.id).toBe("string");
    expect.soft(typeof u.name).toBe("string");
    expect.soft(typeof u.effect).toBe("number");
    if (u.description) expect.soft(typeof u.description).toBe("string");
    if (u.max !== undefined) expect.soft(typeof u.max).toBe("number");
    if (u.chance !== undefined) expect.soft(typeof u.chance).toBe("number");
  });
}
