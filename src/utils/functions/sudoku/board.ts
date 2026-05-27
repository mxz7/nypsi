import { SudokuCoordMode } from "#generated/prisma";
import { logger } from "../../logger";
import { indexToCoord } from "./game";
import sharp = require("sharp");

const CELL = 64;
const CANVAS = CELL * 9; // 576

type SudokuGameBoard = {
  puzzle: string;
  solution: string;
  board: string;
};

const BG = "#1e1e2e";
const BG_COMPLETE = "#1e2a3a";
const BG_WRONG = "#3a1e1e";
const GRID_BOX = "#888899";
const GRID_THIN = "#3a3a52";
const TEXT_GIVEN = "#cdd6f4";
const TEXT_CORRECT = "#89b4fa";
const TEXT_WRONG = "#f38ba8";
const TEXT_COORD = "#585870";

function isGroupComplete(board: string, solution: string, indices: number[]): boolean {
  return indices.every((i) => board[i] !== "-" && board[i] === solution[i]);
}

function buildSvg(game: SudokuGameBoard, coordMode: SudokuCoordMode): string {
  const parts: string[] = [];

  const completedRows = Array.from({ length: 9 }, (_, r) =>
    isGroupComplete(
      game.board,
      game.solution,
      Array.from({ length: 9 }, (__, c) => r * 9 + c),
    ),
  );
  const completedCols = Array.from({ length: 9 }, (_, c) =>
    isGroupComplete(
      game.board,
      game.solution,
      Array.from({ length: 9 }, (__, r) => r * 9 + c),
    ),
  );
  const completedBoxes = Array.from({ length: 9 }, (_, b) => {
    const br = Math.floor(b / 3) * 3;
    const bc = (b % 3) * 3;
    return isGroupComplete(
      game.board,
      game.solution,
      [0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => (br + r) * 9 + (bc + c))),
    );
  });

  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS}" height="${CANVAS}" viewBox="0 0 ${CANVAS} ${CANVAS}">`,
  );

  parts.push(`<rect width="${CANVAS}" height="${CANVAS}" fill="${BG}"/>`);

  // Cells
  for (let i = 0; i < 81; i++) {
    const row = Math.floor(i / 9);
    const col = i % 9;
    const x = col * CELL;
    const y = row * CELL;

    const isGiven = game.puzzle[i] !== "-";
    const boardChar = game.board[i];
    const isFilled = boardChar !== "-";
    const isWrong = isFilled && boardChar !== game.solution[i];

    const boxIndex = Math.floor(row / 3) * 3 + Math.floor(col / 3);
    const groupComplete = completedRows[row] || completedCols[col] || completedBoxes[boxIndex];

    if (isWrong) {
      parts.push(`<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" fill="${BG_WRONG}"/>`);
    } else if (groupComplete) {
      parts.push(
        `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" fill="${BG_COMPLETE}"/>`,
      );
    }

    // Coord label
    const coordLabel = indexToCoord(i, coordMode);
    parts.push(
      `<text x="${x + 3}" y="${y + 11}" font-family="monospace" font-size="10" fill="${TEXT_COORD}">${coordLabel}</text>`,
    );

    // Number
    if (isFilled) {
      const num = isGiven ? game.puzzle[i] : boardChar;
      const textColor = isWrong ? TEXT_WRONG : isGiven ? TEXT_GIVEN : TEXT_CORRECT;
      const fontWeight = isGiven ? "bold" : "normal";
      parts.push(
        `<text x="${x + 32}" y="${y + 47}" font-family="monospace" font-size="38" font-weight="${fontWeight}" text-anchor="middle" fill="${textColor}">${num}</text>`,
      );
    }
  }

  // Grid lines
  for (let i = 0; i <= 9; i++) {
    const pos = i * CELL;
    const isBox = i % 3 === 0;
    const strokeWidth = isBox ? 2 : 0.5;
    const stroke = isBox ? GRID_BOX : GRID_THIN;

    parts.push(
      `<line x1="0" y1="${pos}" x2="${CANVAS}" y2="${pos}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`,
    );
    parts.push(
      `<line x1="${pos}" y1="0" x2="${pos}" y2="${CANVAS}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`,
    );
  }

  parts.push("</svg>");
  return parts.join("\n");
}

export async function renderBoard(
  game: SudokuGameBoard,
  coordMode: SudokuCoordMode,
): Promise<Buffer> {
  const start = performance.now();
  const svg = buildSvg(game, coordMode);

  const sharpBefore = performance.now();
  const result = await sharp(Buffer.from(svg)).png().toBuffer();
  const sharpAfter = performance.now();

  const end = performance.now();
  logger.debug(
    `sudoku: rendered board in ${(end - start).toFixed(2)}ms (sharp: ${(sharpAfter - sharpBefore).toFixed(2)}ms)`,
  );

  return result;
}
