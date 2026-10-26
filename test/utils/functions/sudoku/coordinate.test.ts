import { expect, test } from "vitest";
import {
  coordToIndex,
  indexToCoord,
  isGivenCell,
} from "../../../../src/utils/functions/sudoku/coordinate";

test.each(["coordinates", "box"] as const)("coordinates round-trip in %s mode", (mode) => {
  for (let index = 0; index < 81; index++) {
    expect(coordToIndex(indexToCoord(index, mode), mode)).toBe(index);
  }
});

test("coordinate mode maps columns and rows to board indexes", () => {
  expect(coordToIndex("A1", "coordinates")).toBe(0);
  expect(coordToIndex("i9", "coordinates")).toBe(80);
  expect(coordToIndex("C3", "coordinates")).toBe(20);
});

test("box mode maps boxes and their cells in reading order", () => {
  expect(coordToIndex("A1", "box")).toBe(0);
  expect(coordToIndex("A9", "box")).toBe(20);
  expect(coordToIndex("E5", "box")).toBe(40);
  expect(coordToIndex("I9", "box")).toBe(80);
});

test.each(["", "A", "A0", "A10", "J1", "11", "💥"])("rejects malformed coordinate %j", (coord) => {
  expect(coordToIndex(coord, "coordinates")).toBeNull();
  expect(coordToIndex(coord, "box")).toBeNull();
});

test("identifies given and editable puzzle cells", () => {
  expect(isGivenCell("1-", 0)).toBe(true);
  expect(isGivenCell("1-", 1)).toBe(false);
});
