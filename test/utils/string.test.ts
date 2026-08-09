import { afterAll, describe, expect, test } from "vitest";
import {
  decrypt,
  encrypt,
  compareTwoStrings,
  formatBytes,
  formatTime,
  getDuration,
  getOrdinalSuffix,
  pluralize,
} from "../../src/utils/functions/string";

const originalEncryptKey = process.env.ENCRYPT_KEY;

afterAll(() => {
  if (originalEncryptKey === undefined) {
    delete process.env.ENCRYPT_KEY;
  } else {
    process.env.ENCRYPT_KEY = originalEncryptKey;
  }
});

describe("encryption", () => {
  test("decrypts ciphertext created by CryptoJS", () => {
    process.env.ENCRYPT_KEY = "test encryption key";

    expect(decrypt("U2FsdGVkX18AESIzRFVmd1yXDf7RtLj3L9NdwBSOk0nG5htjL3G9aNkBsZl2L957")).toBe(
      "backwards compatible ✓",
    );
  });

  test("round trips using the OpenSSL salted format", () => {
    process.env.ENCRYPT_KEY = "test encryption key";
    const ciphertext = encrypt("new encrypted content");

    expect(Buffer.from(ciphertext, "base64").subarray(0, 8).toString()).toBe("Salted__");
    expect(decrypt(ciphertext)).toBe("new encrypted content");
  });
});

describe("compareTwoStrings", () => {
  test.each([
    ["", "", 1],
    ["a", "a", 1],
    ["a", "b", 0],
    ["hello", "hello", 1],
    ["hello", "world", 0],
    ["healed", "sealed", 0.8],
    ["web applications", "applications of the web", 0.7878787878787878],
  ])("compares %j with %j", (first, second, expected) => {
    expect(compareTwoStrings(first, second)).toBe(expected);
  });

  test("ignores whitespace", () => {
    expect(compareTwoStrings("hello world", "helloworld")).toBe(1);
  });

  test("counts duplicate bigrams only once per occurrence", () => {
    expect(compareTwoStrings("aaaa", "aa")).toBe(0.5);
  });
});

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
