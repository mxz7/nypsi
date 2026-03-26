import { Chess } from "chess.js";
import * as fs from "fs/promises";
import * as path from "path";
import { logger } from "../../logger";
import sharp = require("sharp");

const SQUARE_SIZE = 70;
const BORDER = 20;
const CANVAS_SIZE = SQUARE_SIZE * 8 + BORDER * 2;

const LIGHT_COLOR = "#F0D9B5";
const DARK_COLOR = "#B58863";
const HIGHLIGHT_COLOR = "rgba(20, 85, 30, 0.5)";
const LABEL_COLOR = "#333333";

const PIECES_DIR = path.join(process.cwd(), "data", "chess_pieces");

// Piece cache keyed by lichess code e.g. "wK", "bP"
const pieceCache = new Map<string, Buffer>();

const PIECE_CODES: string[] = [
  "wK",
  "wQ",
  "wR",
  "wB",
  "wN",
  "wP",
  "bK",
  "bQ",
  "bR",
  "bB",
  "bN",
  "bP",
];

let pieceLoadPromise: Promise<void> | null = null;

function ensureSvgDimensions(svg: string): string {
  const hasWidth = /\swidth\s*=\s*['"][^'"]+['"]/i.test(svg);
  const hasHeight = /\sheight\s*=\s*['"][^'"]+['"]/i.test(svg);

  if (hasWidth && hasHeight) return svg;

  // Lichess pieces use a viewBox (e.g. 0 0 45 45); ensure explicit size for consistent rasterization.
  const viewBoxMatch = svg.match(/viewBox\s*=\s*['"]([^'"]+)['"]/i);
  let width = "45";
  let height = "45";

  if (viewBoxMatch) {
    const values = viewBoxMatch[1].trim().split(/\s+/);
    if (values.length === 4) {
      width = values[2] || width;
      height = values[3] || height;
    }
  }

  return svg.replace(/<svg\b([^>]*)>/i, (full, attrs: string) => {
    let next = attrs;
    if (!hasWidth) next += ` width="${width}"`;
    if (!hasHeight) next += ` height="${height}"`;
    return `<svg${next}>`;
  });
}

async function ensurePiecesLoaded(): Promise<void> {
  if (pieceCache.size === PIECE_CODES.length) return;
  if (pieceLoadPromise) return pieceLoadPromise;

  pieceLoadPromise = (async () => {
    await Promise.all(
      PIECE_CODES.map(async (code) => {
        const svgPath = path.join(PIECES_DIR, `${code}.svg`);
        const rawSvg = await fs.readFile(svgPath, "utf8");
        const svg = ensureSvgDimensions(rawSvg);
        const png = await sharp(Buffer.from(svg))
          .resize(SQUARE_SIZE, SQUARE_SIZE, { fit: "contain" })
          .png()
          .toBuffer();
        pieceCache.set(code, png);
      }),
    );
  })();

  return pieceLoadPromise;
}

/** Map chess.js piece type + color to lichess piece code */
function toPieceCode(type: string, color: string): string {
  const colorChar = color === "w" ? "w" : "b";
  const typeChar = type.toUpperCase();
  return `${colorChar}${typeChar}`;
}

/** Convert a board square (e.g. "e4") to canvas pixel coordinates (top-left of square) */
function squareToXY(square: string, perspective: "white" | "black"): { x: number; y: number } {
  const file = square.charCodeAt(0) - "a".charCodeAt(0); // 0-7
  const rank = parseInt(square[1]) - 1; // 0-7

  let col: number;
  let row: number;
  if (perspective === "white") {
    col = file;
    row = 7 - rank;
  } else {
    col = 7 - file;
    row = rank;
  }

  return {
    x: BORDER + col * SQUARE_SIZE,
    y: BORDER + row * SQUARE_SIZE,
  };
}

export interface RenderOptions {
  lastMove?: { from: string; to: string };
  perspective?: "white" | "black";
}

function renderBaseBoardSvg(opts: RenderOptions, perspective: "white" | "black"): string {
  const parts: string[] = [];

  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS_SIZE}" height="${CANVAS_SIZE}" viewBox="0 0 ${CANVAS_SIZE} ${CANVAS_SIZE}">`,
  );
  parts.push(`<rect x="0" y="0" width="${CANVAS_SIZE}" height="${CANVAS_SIZE}" fill="#1a1a1a"/>`);

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const isLight = (row + col) % 2 === 0;
      const fill = isLight ? LIGHT_COLOR : DARK_COLOR;
      const x = BORDER + col * SQUARE_SIZE;
      const y = BORDER + row * SQUARE_SIZE;
      parts.push(
        `<rect x="${x}" y="${y}" width="${SQUARE_SIZE}" height="${SQUARE_SIZE}" fill="${fill}"/>`,
      );
    }
  }

  if (opts.lastMove) {
    for (const sq of [opts.lastMove.from, opts.lastMove.to]) {
      const { x, y } = squareToXY(sq, perspective);
      parts.push(
        `<rect x="${x}" y="${y}" width="${SQUARE_SIZE}" height="${SQUARE_SIZE}" fill="${HIGHLIGHT_COLOR}"/>`,
      );
    }
  }

  // rank labels
  for (let row = 0; row < 8; row++) {
    const displayRank = perspective === "white" ? 8 - row : row + 1;
    const y = BORDER + row * SQUARE_SIZE + SQUARE_SIZE / 2;
    parts.push(
      `<text x="${BORDER / 2}" y="${y}" fill="${LABEL_COLOR}" font-size="11" font-weight="700" font-family="sans-serif" text-anchor="middle" dominant-baseline="middle">${displayRank}</text>`,
    );
  }

  // file labels
  const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
  for (let col = 0; col < 8; col++) {
    const displayFile = perspective === "white" ? files[col] : files[7 - col];
    const x = BORDER + col * SQUARE_SIZE + SQUARE_SIZE / 2;
    const y = BORDER + 8 * SQUARE_SIZE + BORDER / 2;
    parts.push(
      `<text x="${x}" y="${y}" fill="${LABEL_COLOR}" font-size="11" font-weight="700" font-family="sans-serif" text-anchor="middle" dominant-baseline="middle">${displayFile}</text>`,
    );
  }

  parts.push("</svg>");

  return parts.join("");
}

export async function renderBoard(chess: Chess, opts: RenderOptions = {}): Promise<Buffer> {
  const start = performance.now();
  await ensurePiecesLoaded();

  const perspective = opts.perspective ?? "white";
  const baseSvg = renderBaseBoardSvg(opts, perspective);
  const pieces: sharp.OverlayOptions[] = [];

  const board = chess.board();
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = board[row][col];
      if (!piece) continue;

      const code = toPieceCode(piece.type, piece.color);
      const img = pieceCache.get(code);
      if (!img) continue;

      // board[row][col]: row 0 = rank 8, col 0 = file a
      const file = "abcdefgh"[col];
      const rank = 8 - row;
      const square = `${file}${rank}`;
      const { x, y } = squareToXY(square, perspective);
      pieces.push({ input: img, left: Math.round(x), top: Math.round(y) });
    }
  }

  const res = await sharp(Buffer.from(baseSvg)).png().composite(pieces).png().toBuffer();

  const end = performance.now();

  logger.debug(`chess: rendered board in ${(end - start).toFixed(2)}ms`);

  return res;
}
