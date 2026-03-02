import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { Tag } from "../src/types/Tags";
import Constants from "../src/utils/Constants";

const data: Record<string, Tag> = JSON.parse(readFileSync("data/tags.json").toString());

for (const t of Object.values(data)) {
  test(t.id, () => {
    expect.soft(typeof t.id).toBe("string");
    expect.soft(typeof t.name).toBe("string");
    expect.soft(typeof t.description).toBe("string");
    expect.soft(typeof t.emoji).toBe("string");
    expect
      .soft(Constants.EMOJI_REGEX.test(t.emoji) || Constants.UNICODE_EMOJI_REGEX.test(t.emoji))
      .toBe(true);

    if (Constants.EMOJI_REGEX.test(t.emoji)) {
      expect.soft(t.image).toBeDefined();
    }

    if (t.image) expect.soft(typeof t.image).toBe("string");
  });
}
