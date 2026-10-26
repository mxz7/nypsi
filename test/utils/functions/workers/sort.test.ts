import { describe, expect, test } from "vitest";
import workerSort from "../../../../src/utils/functions/workers/sort";

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
