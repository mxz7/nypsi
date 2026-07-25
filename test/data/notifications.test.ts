import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { LevelDmSetting, Prisma, SudokuCoordMode, WorkerDmSetting } from "#generated/prisma";
import { NotificationData } from "../../src/types/Notification";
import { expectIdMatchesKey, expectNonEmptyString, expectUniqueStrings } from "./helpers";

const data = JSON.parse(readFileSync("data/notifications.json").toString());

test("notifications keys", () => {
  expect.soft(typeof data).toBe("object");
  expect.soft(data.notifications).toBeDefined();
  expect.soft(data.preferences).toBeDefined();
});

const notifications: Record<string, NotificationData> = data.notifications;
const preferences: Record<string, NotificationData> = data.preferences;

test("notification and preference ids should match database settings", () => {
  const notificationFields = Object.values(Prisma.DMSettingsScalarFieldEnum).filter(
    (field) => field !== "userId",
  );
  const preferenceFields = Object.values(Prisma.PreferencesScalarFieldEnum).filter(
    (field) => field !== "userId",
  );

  expect(Object.keys(notifications).sort()).toEqual(notificationFields.sort());
  expect(Object.keys(preferences).sort()).toEqual(preferenceFields.sort());
});

test("notification option values should match database enums", () => {
  expect(notifications.worker.types?.map((type) => type.value).sort()).toEqual(
    Object.values(WorkerDmSetting).sort(),
  );
  expect(notifications.level.types?.map((type) => type.value).sort()).toEqual(
    Object.values(LevelDmSetting).sort(),
  );
  expect(preferences.sudokuCoordMode.types?.map((type) => type.value).sort()).toEqual(
    Object.values(SudokuCoordMode).sort(),
  );
});

for (const [k, v] of Object.entries(notifications)) {
  test(`notification:${k}`, () => {
    expect.soft(typeof v.id).toBe("string");
    expectIdMatchesKey(k, v);
    expectNonEmptyString(v.name, `${k}.name`);
    expectNonEmptyString(v.description, `${k}.description`);
    if (v.types !== undefined) {
      expect.soft(Array.isArray(v.types)).toBe(true);
      expect.soft(v.types.length, `${k}.types should not be empty`).toBeGreaterThan(0);
      expectUniqueStrings(
        v.types.map((type) => type.value),
        `${k}.types values`,
      );
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
    if (v.types !== undefined) {
      expect.soft(Array.isArray(v.types)).toBe(true);
      expect.soft(v.types.length, `${k}.types should not be empty`).toBeGreaterThan(0);
      expectUniqueStrings(
        v.types.map((type) => type.value),
        `${k}.types values`,
      );
      for (const t of v.types) {
        expectNonEmptyString(t.name, `${k}.types.name`);
        expectNonEmptyString(t.description, `${k}.types.description`);
      }
    }
  });
}
