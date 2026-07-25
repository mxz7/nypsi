import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { Event } from "../../src/types/Economy";
import { expectIdMatchesKey, expectNonEmptyString } from "./helpers";

const data: Record<string, Event> = JSON.parse(readFileSync("data/events.json").toString());

for (const [id, ev] of Object.entries(data)) {
  test(id, () => {
    expectIdMatchesKey(id, ev);
    expectNonEmptyString(ev.name, `${id}.name`);
    expectNonEmptyString(ev.description, `${id}.description`);
    expect.soft(ev.description, `${id}.description should contain {target}`).toContain("{target}");
  });
}
