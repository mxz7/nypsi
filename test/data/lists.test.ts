import { expect, test } from "vitest";
import data from "../../data/lists.json";
import { expectUniqueStrings } from "./helpers";

test("work messages should be nonempty and unique", () => {
  expectUniqueStrings(data.workMessages, "workMessages");
});

test("tips should be nonempty and unique", () => {
  expectUniqueStrings(data.tips, "tips");
});

test("countries should be unique ISO alpha-2 codes", () => {
  expectUniqueStrings(data.countries, "countries");

  for (const country of data.countries) {
    expect.soft(country, `invalid country code "${country}"`).toMatch(/^[A-Z]{2}$/);
  }
});
