import { describe, expect, test } from "vitest";
import { filterOutliers } from "../../src/utils/functions/outliers";

describe("filterOutliers", () => {
  test("leaves small samples untouched", () => {
    const values = [100, 3, 2, 1, 4, 5, 6];

    expect(filterOutliers(values)).toBe(values);
  });

  test("removes values outside the interquartile range fences", () => {
    const values = [-1_000, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 1_000];

    expect(filterOutliers(values)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  test("does not mutate the input while sorting the filtered result", () => {
    const values = [10, 3, 8, 5, 1, 9, 2, 7, 4, 6, 11, 12];

    expect(filterOutliers(values)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(values).toEqual([10, 3, 8, 5, 1, 9, 2, 7, 4, 6, 11, 12]);
  });
});
