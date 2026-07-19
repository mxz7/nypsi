import { describe, expect, test } from "vitest";
import chooseMember from "../../src/utils/functions/workers/choosemember";
import workerSort from "../../src/utils/functions/workers/sort";
import wordleSortWorker from "../../src/utils/functions/workers/wordlesort";

describe("workerSort", () => {
  test("sorts records in ascending order in a worker thread", async () => {
    const input = [
      { id: "third", score: 30 },
      { id: "first", score: 10 },
      { id: "second", score: 20 },
    ];

    await expect(workerSort(input, "score", "asc")).resolves.toEqual([
      { id: "first", score: 10 },
      { id: "second", score: 20 },
      { id: "third", score: 30 },
    ]);
    expect(input.map(({ id }) => id)).toEqual(["third", "first", "second"]);
  });

  test("sorts records in descending order by the selected property", async () => {
    const input = [
      { name: "alpha", count: 2 },
      { name: "bravo", count: 5 },
      { name: "charlie", count: 3 },
    ];

    const result = await workerSort(input, "count", "desc");

    expect(result.map(({ count }) => count)).toEqual([5, 3, 2]);
  });

  test("handles an empty collection", async () => {
    await expect(workerSort([], "value" as never, "asc")).resolves.toEqual([]);
  });
});

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

describe("chooseMember", () => {
  const members = [
    {
      userId: "100",
      username: "alice",
      displayName: "Alice Example",
      nickname: "ally",
      roles: [],
      bot: false,
      joinedTimestamp: 1,
    },
    {
      userId: "200",
      username: "bob",
      displayName: "Bob Example",
      roles: [],
      bot: false,
      joinedTimestamp: 2,
    },
  ];

  test("matches exact user IDs and usernames", async () => {
    await expect(chooseMember(members, "200")).resolves.toBe("200");
    await expect(chooseMember(members, "alice")).resolves.toBe("100");
  });

  test("selects the strongest fuzzy match", async () => {
    await expect(chooseMember(members, "alicee")).resolves.toBe("100");
  });

  test("returns null when no candidate reaches the score threshold", async () => {
    await expect(chooseMember(members, "zzzzzz")).resolves.toBeNull();
  });
});
