import { Chess } from "chess.js";
import sharp from "sharp";
import { describe, expect, test, vi } from "vitest";

vi.mock("../../src/utils/logger", () => ({
  logger: { debug: vi.fn() },
}));

import { renderBoard, squareToXY } from "../../src/utils/functions/chess/board";
import { normalizeToUci } from "../../src/utils/functions/chess/moves";

describe("squareToXY", () => {
  test.each([
    ["a8", "white", { x: 0, y: 0 }],
    ["h1", "white", { x: 490, y: 490 }],
    ["e4", "white", { x: 280, y: 280 }],
    ["a8", "black", { x: 490, y: 490 }],
    ["h1", "black", { x: 0, y: 0 }],
    ["e4", "black", { x: 210, y: 210 }],
  ] as const)("maps %s from the %s perspective", (square, perspective, expected) => {
    expect(squareToXY(square, perspective)).toEqual(expected);
  });
});

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

describe("renderBoard", () => {
  test("renders a complete PNG at the expected board dimensions", async () => {
    const buffer = await renderBoard(new Chess());
    const metadata = await sharp(buffer).metadata();

    expect(metadata.format).toBe("png");
    expect(metadata.width).toBe(560);
    expect(metadata.height).toBe(560);
    expect(metadata.hasAlpha).toBe(true);
  });

  test("renders deterministically after the piece cache is populated", async () => {
    const chess = new Chess();

    const first = await renderBoard(chess);
    const second = await renderBoard(chess);

    expect(second.equals(first)).toBe(true);
  });

  test("changes the board orientation for black's perspective", async () => {
    const chess = new Chess();

    const white = await renderBoard(chess, { perspective: "white" });
    const black = await renderBoard(chess, { perspective: "black" });

    expect(black.equals(white)).toBe(false);
  });

  test("renders last-move highlights", async () => {
    const chess = new Chess();

    const plain = await renderBoard(chess);
    const highlighted = await renderBoard(chess, {
      lastMove: { from: "a3", to: "h6" },
    });

    expect(highlighted.equals(plain)).toBe(false);
  });

  test("renders a checkmated king without failing", async () => {
    const chess = new Chess();
    chess.move("f3");
    chess.move("e5");
    chess.move("g4");
    chess.move("Qh4#");

    expect(chess.isCheckmate()).toBe(true);
    await expect(renderBoard(chess)).resolves.toBeInstanceOf(Buffer);
  });
});
