import { afterEach, describe, expect, test, vi } from "vitest";
import { MStoTime, daysAgo, daysUntil, daysUntilChristmas } from "../../src/utils/functions/date";

afterEach(() => {
  vi.useRealTimers();
});

describe("relative day calculations", () => {
  test("rounds elapsed and remaining partial days down", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-19T12:00:00Z"));

    expect(daysAgo(new Date("2026-07-17T11:59:59Z"))).toBe(2);
    expect(daysAgo(new Date("2026-07-18T12:00:01Z"))).toBe(0);
    expect(daysUntil(new Date("2026-07-21T12:00:00Z"))).toBe(2);
    expect(daysUntil(new Date("2026-07-20T11:59:59Z"))).toBe(0);
  });

  test("returns negative values for dates on the opposite side of now", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-19T12:00:00Z"));

    expect(daysAgo(new Date("2026-07-20T12:00:00Z"))).toBe(-1);
    expect(daysUntil(new Date("2026-07-18T12:00:00Z"))).toBe(-1);
  });
});

describe("daysUntilChristmas", () => {
  test("recognises Christmas Day", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 11, 25, 12));

    expect(daysUntilChristmas()).toBe("ITS CHRISTMAS");
  });

  test("counts down to Christmas before December 25", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 11, 24, 12));

    expect(daysUntilChristmas()).toBe("1");
  });
});

describe("MStoTime", () => {
  test("formats a duration containing every unit", () => {
    const duration = 2 * 86_400_000 + 3 * 3_600_000 + 4 * 60_000 + 5_000;

    expect(MStoTime(duration)).toBe("2d 3h 4m 5s");
  });

  test("omits units whose value is zero", () => {
    expect(MStoTime(3_605_000)).toBe("1h 5s");
  });

  test("uses long singular and plural unit names", () => {
    expect(MStoTime(86_400_000 + 2 * 3_600_000 + 60_000 + 2_000, true)).toBe(
      "1 day 2 hours 1 minute 2 seconds",
    );
  });

  test("formats a zero duration in both modes", () => {
    expect(MStoTime(0)).toBe("0s");
    expect(MStoTime(0, true)).toBe("0 seconds");
  });
});
