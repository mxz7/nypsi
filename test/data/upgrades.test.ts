import { readFileSync } from "node:fs";
import { test } from "vitest";
import { UserUpgrade } from "../../src/types/Economy";
import {
  expectIdMatchesKey,
  expectNonEmptyString,
  expectPositiveInteger,
  expectPositiveNumber,
} from "./helpers";

const data: Record<string, UserUpgrade> = JSON.parse(readFileSync("data/upgrades.json").toString());

for (const [id, u] of Object.entries(data)) {
  test(id, () => {
    expectIdMatchesKey(id, u);
    expectNonEmptyString(u.name, `${id}.name`);
    expectNonEmptyString(u.description, `${id}.description`);
    expectPositiveNumber(u.effect, `${id}.effect`);
    if (u.max !== undefined) {
      expectPositiveInteger(u.max, `${id}.max`);
    }
    if (u.chance !== undefined) {
      expectPositiveNumber(u.chance, `${id}.chance`);
    }
  });
}
