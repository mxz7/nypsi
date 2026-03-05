import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { NotificationData } from "../src/types/Notification";

const data = JSON.parse(readFileSync("data/notifications.json").toString());

test("notifications keys", () => {
  expect.soft(typeof data).toBe("object");
  expect.soft(data.notifications).toBeDefined();
  expect.soft(data.preferences).toBeDefined();
});

const notifications: Record<string, NotificationData> = data.notifications;
const preferences: Record<string, NotificationData> = data.preferences;

for (const [k, v] of Object.entries(notifications)) {
  test(`notification:${k}`, () => {
    expect.soft(typeof v.id).toBe("string");
    expect.soft(typeof v.name).toBe("string");
    expect.soft(typeof v.description).toBe("string");
    if (v.types) {
      expect.soft(Array.isArray(v.types)).toBe(true);
      for (const t of v.types) {
        expect.soft(typeof t.name).toBe("string");
        expect.soft(typeof t.description).toBe("string");
        expect.soft(typeof t.value).toBe("string");
      }
    }
  });
}

for (const [k, v] of Object.entries(preferences)) {
  test(`preference:${k}`, () => {
    expect.soft(typeof v.id).toBe("string");
    expect.soft(typeof v.name).toBe("string");
    expect.soft(typeof v.description).toBe("string");
    if (v.types) {
      expect.soft(Array.isArray(v.types)).toBe(true);
      for (const t of v.types) {
        expect.soft(typeof t.name).toBe("string");
        expect.soft(typeof t.description).toBe("string");
        expect.soft(typeof t.value).toBe("string");
      }
    }
  });
}
