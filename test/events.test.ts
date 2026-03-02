import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { Event } from "../src/types/Economy";

const data: Record<string, Event> = JSON.parse(readFileSync("data/events.json").toString());

for (const ev of Object.values(data)) {
  test(ev.id, () => {
    expect.soft(typeof ev.id).toBe("string");
    expect.soft(typeof ev.name).toBe("string");
    expect.soft(typeof ev.description).toBe("string");
  });
}
