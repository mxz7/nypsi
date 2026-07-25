import { readFileSync } from "node:fs";
import { expect } from "vitest";

export function expectIdMatchesKey(key: string, value: { id?: unknown }) {
  expect.soft(value.id, `embedded id for "${key}"`).toBe(key);
}

export function expectNonEmptyString(value: unknown, label: string) {
  expect.soft(typeof value, label).toBe("string");
  if (typeof value === "string") {
    expect.soft(value.trim().length, `${label} should not be empty`).toBeGreaterThan(0);
  }
}

export function expectPositiveNumber(value: unknown, label: string) {
  expect.soft(typeof value, label).toBe("number");
  if (typeof value === "number") {
    expect.soft(Number.isFinite(value), `${label} should be finite`).toBe(true);
    expect.soft(value, label).toBeGreaterThan(0);
  }
}

export function expectPositiveInteger(value: unknown, label: string) {
  expectPositiveNumber(value, label);
  if (typeof value === "number") {
    expect.soft(Number.isInteger(value), `${label} should be an integer`).toBe(true);
  }
}

export function expectUniqueStrings(values: unknown, label: string) {
  expect.soft(Array.isArray(values), label).toBe(true);
  if (!Array.isArray(values)) return;

  const seen = new Set<string>();
  for (const value of values) {
    expectNonEmptyString(value, `${label} entry`);
    if (typeof value === "string") {
      expect.soft(seen.has(value), `duplicate ${label} entry "${value}"`).toBe(false);
      seen.add(value);
    }
  }
}

export function readLines(path: string) {
  return readFileSync(path, "utf-8").trim().replaceAll("\r", "").split("\n");
}
