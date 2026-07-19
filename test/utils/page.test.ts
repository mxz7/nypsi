import { describe, expect, test } from "vitest";
import PageManager from "../../src/utils/functions/page";

describe("PageManager.createPages", () => {
  test("splits an array into numbered pages", () => {
    const pages = PageManager.createPages([1, 2, 3, 4, 5], 2);

    expect(Array.from(pages.entries())).toEqual([
      [1, [1, 2]],
      [2, [3, 4]],
      [3, [5]],
    ]);
  });

  test("uses ten items per page by default", () => {
    const values = Array.from({ length: 11 }, (_, index) => index + 1);

    expect(Array.from(PageManager.createPages(values).values())).toEqual([
      values.slice(0, 10),
      [11],
    ]);
  });

  test("returns no pages for an empty array", () => {
    expect(PageManager.createPages([])).toEqual(new Map());
  });

  test("preserves object references and input order", () => {
    const first = { id: 1 };
    const second = { id: 2 };

    const pages = PageManager.createPages([first, second], 1);

    expect(pages.get(1)?.[0]).toBe(first);
    expect(pages.get(2)?.[0]).toBe(second);
  });
});
