import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { GuildUpgrade } from "../src/types/Economy";

const data: Record<string, GuildUpgrade> = JSON.parse(
  readFileSync("data/guild_upgrades.json").toString(),
);

for (const g of Object.values(data)) {
  test(g.id, () => {
    expect.soft(typeof g.id).toBe("string");
    expect.soft(typeof g.name).toBe("string");
    expect.soft(typeof g.description).toBe("string");
    expect.soft(typeof g.cost).toBe("number");
    expect.soft(g.cost).toBeGreaterThan(0);
    expect.soft(typeof g.increment_per_level).toBe("number");
    expect.soft(g.increment_per_level).toBeGreaterThanOrEqual(0);
  });
}
