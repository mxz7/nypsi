import { Chess } from "chess.js";
import { describe, expect, test } from "vitest";
import { normalizeToUci } from "../../../../src/utils/functions/chess/moves";

describe("normalizeToUci", () => {
  test.each([
    ["e2e4", "e2e4"],
    [" E2E4 ", "e2e4"],
    ["e4", "e2e4"],
    ["Nf3", "g1f3"],
  ])("normalizes %j to %s", (input, expected) => {
    expect(normalizeToUci(input, new Chess())).toBe(expected);
  });

  test("normalizes promotion coordinates", () => {
    const chess = new Chess("7k/P7/8/8/8/8/8/4K3 w - - 0 1");

    expect(normalizeToUci("a7a8q", chess)).toBe("a7a8q");
  });

  test.each(["e2e5", "a9a1", "not a move", ""])("rejects illegal move %j", (input) => {
    expect(normalizeToUci(input, new Chess())).toBeNull();
  });

  test("does not mutate the supplied game", () => {
    const chess = new Chess();
    const fen = chess.fen();

    expect(normalizeToUci("e4", chess)).toBe("e2e4");
    expect(chess.fen()).toBe(fen);
  });
});
