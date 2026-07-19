import { describe, expect, test } from "vitest";
import {
  formatBytes,
  formatTime,
  getDuration,
  getOrdinalSuffix,
  pluralize,
} from "../../src/utils/functions/string";

describe("getDuration", () => {
  test("parses a duration containing every supported unit", () => {
    expect(getDuration("1d2h3m4s")).toBe(93_784);
  });

  test("accepts whitespace and uppercase units", () => {
    expect(getDuration(" 2H30M ")).toBe(9_000);
  });

  test.each(["1h2d", "1.5h", "1 hour", "5m extra", "-1s"])(
    "rejects an invalid duration: %s",
    (duration) => {
      expect(getDuration(duration)).toBeUndefined();
    },
  );

  test("returns zero for an empty duration", () => {
    expect(getDuration("")).toBe(0);
  });
});

describe("pluralize", () => {
  test("uses the default and custom plural forms for strings", () => {
    expect(pluralize("day", 1)).toBe("day");
    expect(pluralize("day", 2)).toBe("days");
    expect(pluralize("person", 2, "people")).toBe("people");
  });

  test("supports bigint amounts", () => {
    expect(pluralize("item", 1n)).toBe("item");
    expect(pluralize("item", 0n)).toBe("items");
  });

  test("uses item names and their configured plural", () => {
    const item = { name: "berry", plural: "berries" } as Parameters<typeof pluralize>[0];

    expect(pluralize(item, 1)).toBe("berry");
    expect(pluralize(item, 3)).toBe("berries");
  });

  test("uses worker upgrade type labels", () => {
    const upgrade = {
      type: "worker",
      type_plural: "workers",
    } as Parameters<typeof pluralize>[0];

    expect(pluralize(upgrade, 1)).toBe("worker");
    expect(pluralize(upgrade, 2)).toBe("workers");
  });
});

describe("formatBytes", () => {
  test.each([
    [0, "0 MB"],
    [500, "0 MB"],
    [1_500_000, "1.5 MB"],
    [2_500_000_000, "2.5 GB"],
    [1_234_567_890, "1.23 GB"],
  ])("formats %d bytes as %s", (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected);
  });
});

describe("getOrdinalSuffix", () => {
  test.each([
    [1, "st"],
    [2, "nd"],
    [3, "rd"],
    [4, "th"],
    [11, "th"],
    [12, "th"],
    [13, "th"],
    [21, "st"],
    [102, "nd"],
  ])("returns %s for %d", (number, expected) => {
    expect(getOrdinalSuffix(number)).toBe(expected);
  });
});

describe("formatTime", () => {
  test("retains hundredths of a second below one minute", () => {
    expect(formatTime(12_345)).toBe("12.35s");
  });

  test("rounds seconds when minutes are present", () => {
    expect(formatTime(125_600)).toBe("2m6s");
  });
});
