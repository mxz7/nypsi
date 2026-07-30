import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import {
  LEVEL_NOTIFICATION_PREFERENCES,
  PreferenceData,
  WORKER_NOTIFICATION_PREFERENCES,
} from "../../src/types/Preferences";
import { SUDOKU_COORD_MODES } from "../../src/types/Sudoku";
import { expectIdMatchesKey, expectNonEmptyString, expectUniqueStrings } from "./helpers";

const data = JSON.parse(readFileSync("data/preferences.json").toString());

test("notifications keys", () => {
  expect.soft(typeof data).toBe("object");
  expect.soft(data.notifications).toBeDefined();
  expect.soft(data.general).toBeDefined();
});

const notifications: Record<string, PreferenceData> = data.notifications;
const preferences: Record<string, PreferenceData> = data.general;

test("notification and preference keys should not overlap", () => {
  const preferenceKeys = new Set(Object.keys(preferences));

  expect(Object.keys(notifications).filter((key) => preferenceKeys.has(key))).toEqual([]);
});

test("notification option values should match application enums", () => {
  expect(notifications.worker.types?.map((type) => type.value).sort()).toEqual(
    [...WORKER_NOTIFICATION_PREFERENCES].sort(),
  );
  expect(notifications.level.types?.map((type) => type.value).sort()).toEqual(
    [...LEVEL_NOTIFICATION_PREFERENCES].sort(),
  );
  expect(preferences.sudokuCoordMode.types?.map((type) => type.value).sort()).toEqual(
    [...SUDOKU_COORD_MODES].sort(),
  );
});

for (const [k, v] of Object.entries(notifications)) {
  test(`notification:${k}`, () => {
    expect.soft(typeof v.id).toBe("string");
    expectIdMatchesKey(k, v);
    expectNonEmptyString(v.name, `${k}.name`);
    expectNonEmptyString(v.description, `${k}.description`);
    expect(["boolean", "number", "string"]).toContain(typeof v.default);
    if (v.types !== undefined) {
      expect.soft(Array.isArray(v.types)).toBe(true);
      expect.soft(v.types.length, `${k}.types should not be empty`).toBeGreaterThan(0);
      expectUniqueStrings(
        v.types.map((type) => type.value),
        `${k}.types values`,
      );
      expect(v.types.map((type) => type.value)).toContain(v.default);
      for (const t of v.types) {
        expectNonEmptyString(t.name, `${k}.types.name`);
        expectNonEmptyString(t.description, `${k}.types.description`);
      }
    }
  });
}

for (const [k, v] of Object.entries(preferences)) {
  test(`preference:${k}`, () => {
    expectIdMatchesKey(k, v);
    expectNonEmptyString(v.name, `${k}.name`);
    expectNonEmptyString(v.description, `${k}.description`);
    expect(["boolean", "number", "string"]).toContain(typeof v.default);
    if (v.types !== undefined) {
      expect.soft(Array.isArray(v.types)).toBe(true);
      expect.soft(v.types.length, `${k}.types should not be empty`).toBeGreaterThan(0);
      expectUniqueStrings(
        v.types.map((type) => type.value),
        `${k}.types values`,
      );
      expect(v.types.map((type) => type.value)).toContain(v.default);
      for (const t of v.types) {
        expectNonEmptyString(t.name, `${k}.types.name`);
        expectNonEmptyString(t.description, `${k}.types.description`);
      }
    }
  });
}
