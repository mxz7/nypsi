import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { AchievementData } from "../src/types/Economy";

const data: Record<string, AchievementData> = JSON.parse(
  readFileSync("data/achievements.json").toString(),
);

for (const ach of Object.values(data)) {
  test(ach.id, () => {
    expect.soft(typeof ach.id).toBe("string");
    expect.soft(typeof ach.name).toBe("string");
    expect.soft(typeof ach.emoji).toBe("string");
    expect.soft(typeof ach.target).toBe("number");
    expect.soft(typeof ach.description).toBe("string");
    if (ach.prize) {
      expect.soft(Array.isArray(ach.prize)).toBe(true);
    }
  });
}
