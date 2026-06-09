import { expect, test } from "vitest";
import {
  clearDigitNotesFromPeers,
  EMPTY_CELL_CHAR,
  decodeCellChar,
  encodeNoteMask,
  getPeerIndexes,
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

test("getPeerIndexes returns 20 unique peers", () => {
  const peers = getPeerIndexes(40);

  expect(peers.length).toBe(20);
  expect(new Set(peers).size).toBe(20);
  expect(peers.includes(40)).toBe(false);
});

test("clearDigitNotesFromPeers removes digit notes in row/column/box peers", () => {
  const targetIndex = 40;
  const targetDigit = 5;
  const noteMask = (1 << (targetDigit - 1)) | (1 << 1);

  const board = Array(81).fill("1") as string[];
  board[targetIndex] = String(targetDigit);

  const rowPeer = 36;
  const colPeer = 4;
  const boxPeer = 30;
  const nonPeer = 0;

  board[rowPeer] = encodeNoteMask(noteMask);
  board[colPeer] = encodeNoteMask(noteMask);
  board[boxPeer] = encodeNoteMask(noteMask);
  board[nonPeer] = encodeNoteMask(noteMask);

  const updated = clearDigitNotesFromPeers(board.join(""), targetIndex, targetDigit);

  const rowDecoded = decodeCellChar(updated[rowPeer]);
  const colDecoded = decodeCellChar(updated[colPeer]);
  const boxDecoded = decodeCellChar(updated[boxPeer]);
  const nonPeerDecoded = decodeCellChar(updated[nonPeer]);

  expect(rowDecoded.kind).toBe("notes");
  expect(colDecoded.kind).toBe("notes");
  expect(boxDecoded.kind).toBe("notes");
  expect(nonPeerDecoded.kind).toBe("notes");

  if (rowDecoded.kind === "notes") expect(hasNote(rowDecoded.mask, targetDigit)).toBe(false);
  if (colDecoded.kind === "notes") expect(hasNote(colDecoded.mask, targetDigit)).toBe(false);
  if (boxDecoded.kind === "notes") expect(hasNote(boxDecoded.mask, targetDigit)).toBe(false);
  if (nonPeerDecoded.kind === "notes") expect(hasNote(nonPeerDecoded.mask, targetDigit)).toBe(true);
});

test("clearDigitNotesFromPeers preserves other notes in peers", () => {
  const targetIndex = 0;
  const targetDigit = 9;

  const board = Array(81).fill("1") as string[];
  board[targetIndex] = String(targetDigit);

  const peer = 1;
  const peerMask = (1 << (targetDigit - 1)) | (1 << 2);
  board[peer] = encodeNoteMask(peerMask);

  const updated = clearDigitNotesFromPeers(board.join(""), targetIndex, targetDigit);
  const updatedCell = decodeCellChar(updated[peer]);

  expect(updatedCell.kind).toBe("notes");
  if (updatedCell.kind === "notes") {
    expect(hasNote(updatedCell.mask, targetDigit)).toBe(false);
    expect(hasNote(updatedCell.mask, 3)).toBe(true);
  }
});
