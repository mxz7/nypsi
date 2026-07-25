import { readFileSync } from "node:fs";
import { test } from "vitest";
import { GuildUpgrade } from "../../src/types/Economy";
import {
  expectIdMatchesKey,
  expectNonEmptyString,
  expectPositiveInteger,
  expectPositiveNumber,
} from "./helpers";

const data: Record<string, GuildUpgrade> = JSON.parse(
  readFileSync("data/guild_upgrades.json").toString(),
);

for (const [id, g] of Object.entries(data)) {
  test(id, () => {
    expectIdMatchesKey(id, g);
    expectNonEmptyString(g.name, `${id}.name`);
    expectNonEmptyString(g.description, `${id}.description`);
    expectPositiveInteger(g.cost, `${id}.cost`);
    expectPositiveNumber(g.increment_per_level, `${id}.increment_per_level`);
  });
}
