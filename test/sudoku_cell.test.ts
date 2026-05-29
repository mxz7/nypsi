import { expect, test } from "vitest";
import {
  EMPTY_CELL_CHAR,
  decodeCellChar,
  encodeNoteMask,
  hasNote,
  isRawDigitChar,
  isValidNoteChar,
  sanitizeBoardString,
  sanitizeCellChar,
  toggleNoteMask,
} from "../src/utils/functions/sudoku/cell";

test("digits are always raw numeric characters", () => {
  for (let i = 1; i <= 9; i++) {
    const raw = i.toString();
    expect(isRawDigitChar(raw)).toBe(true);
    const decoded = decodeCellChar(raw);
    expect(decoded.kind).toBe("digit");

    if (decoded.kind === "digit") {
      expect(decoded.digit).toBe(i);
      expect(decoded.raw).toBe(raw);
    }
  }
});

test("note mask 0 is a valid note character", () => {
  expect(EMPTY_CELL_CHAR.length).toBe(1);
  expect(EMPTY_CELL_CHAR).toBe("-");
  expect(isValidNoteChar(EMPTY_CELL_CHAR)).toBe(true);

  const decoded = decodeCellChar(EMPTY_CELL_CHAR);
  expect(decoded.kind).toBe("notes");
  if (decoded.kind === "notes") {
    expect(decoded.mask).toBe(0);
  }
});

test("toggleNoteMask supports multiple notes in one cell", () => {
  let mask = 0;
  mask = toggleNoteMask(mask, 1);
  mask = toggleNoteMask(mask, 3);
  mask = toggleNoteMask(mask, 9);

  expect(hasNote(mask, 1)).toBe(true);
  expect(hasNote(mask, 2)).toBe(false);
  expect(hasNote(mask, 3)).toBe(true);
  expect(hasNote(mask, 9)).toBe(true);

  mask = toggleNoteMask(mask, 3);
  expect(hasNote(mask, 3)).toBe(false);
});

test("invalid characters sanitize to mask-0 note character", () => {
  expect(sanitizeCellChar("-")).toBe(EMPTY_CELL_CHAR);
  expect(sanitizeCellChar("a")).toBe(EMPTY_CELL_CHAR);
  expect(sanitizeCellChar("💥")).toBe(EMPTY_CELL_CHAR);
});

test("sanitizeBoardString enforces 81 one-char cells", () => {
  const validNote = encodeNoteMask(12);
  const board = `1${validNote}-abc`;
  const sanitized = sanitizeBoardString(board);

  expect(sanitized.length).toBe(81);
  expect(sanitized[0]).toBe("1");
  expect(sanitized[1]).toBe(validNote);
  expect(sanitized[2]).toBe(EMPTY_CELL_CHAR);
  expect(sanitized[3]).toBe(EMPTY_CELL_CHAR);
  expect(sanitized[4]).toBe(EMPTY_CELL_CHAR);
  expect(sanitized[5]).toBe(EMPTY_CELL_CHAR);
  expect(sanitized[80]).toBe(EMPTY_CELL_CHAR);
});

test("encode/decode note masks round-trip", () => {
  const masks = [0, 1, 3, 17, 255, 511];

  for (const mask of masks) {
    const encoded = encodeNoteMask(mask);
    const decoded = decodeCellChar(encoded);

    expect(decoded.kind).toBe("notes");
    if (decoded.kind === "notes") {
      expect(decoded.mask).toBe(mask);
    }
  }
});
