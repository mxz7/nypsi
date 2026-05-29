import { SudokuCoordMode } from "#generated/prisma";
import { logger } from "../../logger";
import { decodeCellChar, hasNote, isRawDigitChar } from "./cell";
import { indexToCoord } from "./game";
import sharp = require("sharp");

const CELL = 96;
const CANVAS = CELL * 9; // 864

type SudokuGameBoard = {
  puzzle: string;
  solution: string;
  board: string;
};

const BG = "#313136";
const BG_COMPLETE = "#3d3d43";
const BG_HIGHLIGHT = "#29292e";
const BG_CROSSHAIR = "#393940";
const BG_LASTMOVE_CORRECT = "#19324a"; // faded blue
const BG_LASTMOVE_WRONG = "#4a2320"; // faded red
const GRID_BOX = "#8b8b98";
const GRID_THIN = "#646470";
const TEXT_GIVEN = "#e8e8f0";
const TEXT_CORRECT = "#7ab8f5";
const TEXT_WRONG = "#f47067";
const TEXT_COORD = "#6e6e7e";
const TEXT_NOTE = "#7a7a98";

function isGroupComplete(board: string, solution: string, indices: number[]): boolean {
  return indices.every((i) => isRawDigitChar(board[i]) && board[i] === solution[i]);
}

function buildSvg(
  game: SudokuGameBoard,
  coordMode: SudokuCoordMode,
  highlight?: number,
  lastCell?: number,
  crosshair?: number,
): string {
  const parts: string[] = [];
  const board = game.board;

  const completedRows = Array.from({ length: 9 }, (_, r) =>
    isGroupComplete(
      board,
      game.solution,
      Array.from({ length: 9 }, (__, c) => r * 9 + c),
    ),
  );
  const completedCols = Array.from({ length: 9 }, (_, c) =>
    isGroupComplete(
      board,
      game.solution,
      Array.from({ length: 9 }, (__, r) => r * 9 + c),
    ),
  );
  const completedBoxes = Array.from({ length: 9 }, (_, b) => {
    const br = Math.floor(b / 3) * 3;
    const bc = (b % 3) * 3;
    return isGroupComplete(
      board,
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
    const boardChar = board[i];
    const decoded = decodeCellChar(boardChar);
    const isFilled = isGiven || decoded.kind === "digit";
    const shownDigit = isGiven ? game.puzzle[i] : decoded.kind === "digit" ? decoded.raw : null;
    const isWrong = !isGiven && decoded.kind === "digit" && decoded.raw !== game.solution[i];

    const boxIndex = Math.floor(row / 3) * 3 + Math.floor(col / 3);
    const groupComplete = completedRows[row] || completedCols[col] || completedBoxes[boxIndex];
    const cellDigit = shownDigit ? parseInt(shownDigit, 10) : null;
    const inCrosshair =
      crosshair !== undefined && (row === Math.floor(crosshair / 9) || col === crosshair % 9);

    if (lastCell === i && isFilled) {
      // Strong highlight for last move
      const isLastCorrect = shownDigit === game.solution[i];
      const lastBg = isLastCorrect ? BG_LASTMOVE_CORRECT : BG_LASTMOVE_WRONG;
      parts.push(`<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" fill="${lastBg}"/>`);
    } else if (highlight !== undefined && cellDigit === highlight) {
      parts.push(
        `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" fill="${BG_HIGHLIGHT}"/>`,
      );
    } else if (inCrosshair) {
      parts.push(
        `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" fill="${BG_CROSSHAIR}"/>`,
      );
    } else if (groupComplete) {
      parts.push(
        `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" fill="${BG_COMPLETE}"/>`,
      );
    }

    // Coord label
    const coordLabel = indexToCoord(i, coordMode);
    parts.push(
      `<text x="${x + 4}" y="${y + 17}" font-family="monospace" font-size="18" fill="${TEXT_COORD}">${coordLabel}</text>`,
    );

    // Number or note
    if (isFilled) {
      const num = shownDigit;
      const textColor = isWrong ? TEXT_WRONG : isGiven ? TEXT_GIVEN : TEXT_CORRECT;
      parts.push(
        `<text x="${x + 48}" y="${y + 70}" font-family="monospace" font-size="54" font-weight="bold" text-anchor="middle" fill="${textColor}">${num}</text>`,
      );
    } else {
      const mask = decoded.kind === "notes" ? decoded.mask : 0;
      const noteXs = [x + 18, x + 48, x + 78];
      const noteYs = [y + 38, y + 62, y + 86];

      for (let noteDigit = 1; noteDigit <= 9; noteDigit++) {
        if (!hasNote(mask, noteDigit)) continue;

        const idx = noteDigit - 1;
        const noteCol = idx % 3;
        const noteRow = Math.floor(idx / 3);
        parts.push(
          `<text x="${noteXs[noteCol]}" y="${noteYs[noteRow]}" font-family="monospace" font-size="20" font-weight="bold" text-anchor="middle" fill="${TEXT_NOTE}">${noteDigit}</text>`,
        );
      }
    }
  }

  // Grid lines (inner only — no outer border)
  for (let i = 1; i <= 8; i++) {
    const pos = i * CELL;
    const isBox = i % 3 === 0;
    const strokeWidth = isBox ? 3 : 1.5;
    const stroke = isBox ? GRID_BOX : GRID_THIN;

    parts.push(
      `<line x1="0" y1="${pos}" x2="${CANVAS}" y2="${pos}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`,
    );
    parts.push(
      `<line x1="${pos}" y1="0" x2="${pos}" y2="${CANVAS}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`,
    );
  }

  parts.push(
    `<rect x="1.5" y="1.5" width="${CANVAS - 3}" height="${CANVAS - 3}" fill="none" stroke="${GRID_BOX}" stroke-width="3"/>`,
  );

  parts.push("</svg>");
  return parts.join("\n");
}

export async function renderBoard(
  game: SudokuGameBoard,
  coordMode: SudokuCoordMode,
  highlight?: number,
  lastCell?: number,
  crosshair?: number,
): Promise<Buffer> {
  const start = performance.now();
  const svg = buildSvg(game, coordMode, highlight, lastCell, crosshair);

  const sharpBefore = performance.now();
  const result = await sharp(Buffer.from(svg)).png().toBuffer();
  const sharpAfter = performance.now();

  const end = performance.now();
  logger.debug(
    `sudoku: rendered board in ${(end - start).toFixed(2)}ms (sharp: ${(sharpAfter - sharpBefore).toFixed(2)}ms)`,
  );

  return result;
}
