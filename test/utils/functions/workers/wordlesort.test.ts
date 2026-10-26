import { describe, expect, test } from "vitest";
import wordleSortWorker from "../../../../src/utils/functions/workers/wordlesort";

describe("wordleSortWorker", () => {
  test("totals wins, removes blacklisted users, and sorts descending", async () => {
    const result = await wordleSortWorker([
      {
        user: { id: "low", lastKnownUsername: "low", blacklisted: false },
        win1: 1,
        win2: 2,
        win3: 3,
        win4: 0,
        win5: 0,
        win6: 0,
      },
      {
        user: { id: "blocked", lastKnownUsername: "blocked", blacklisted: true },
        win1: 100,
        win2: 100,
        win3: 100,
        win4: 100,
        win5: 100,
        win6: 100,
      },
      {
        user: { id: "high", lastKnownUsername: "high", blacklisted: false },
        win1: 6,
        win2: 5,
        win3: 4,
        win4: 3,
        win5: 2,
        win6: 1,
      },
    ]);

    expect(result).toEqual([
      {
        wins: 21,
        user: { id: "high", lastKnownUsername: "high", blacklisted: false },
      },
      {
        wins: 6,
        user: { id: "low", lastKnownUsername: "low", blacklisted: false },
      },
    ]);
  });

  test("limits the result to the top one hundred users", async () => {
    const input = Array.from({ length: 105 }, (_, index) => ({
      user: {
        id: index.toString(),
        lastKnownUsername: `user-${index}`,
        blacklisted: false,
      },
      win1: index,
      win2: 0,
      win3: 0,
      win4: 0,
      win5: 0,
      win6: 0,
    }));

    const result = await wordleSortWorker(input);

    expect(result).toHaveLength(100);
    expect(result[0].wins).toBe(104);
    expect(result.at(-1)?.wins).toBe(5);
  });
});
