import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { Tag } from "../src/types/Tags";

const data: Record<string, Tag> = JSON.parse(readFileSync("data/tags.json").toString());

for (const t of Object.values(data)) {
  test(t.id, () => {
    expect.soft(typeof t.id).toBe("string");
    expect.soft(typeof t.name).toBe("string");
    expect.soft(typeof t.description).toBe("string");
    expect.soft(typeof t.emoji).toBe("string");
    if (t.image) expect.soft(typeof t.image).toBe("string");
  });
}
