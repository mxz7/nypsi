import { SudokuCoordMode } from "#generated/prisma";
import { indexToCoord } from "./game";
import sharp = require("sharp");

const CELL = 60;
const BORDER = 30;
const CANVAS = CELL * 9 + BORDER * 2; // 600

type SudokuGameBoard = {
  puzzle: string;
  solution: string;
  board: string;
};

function buildSvg(game: SudokuGameBoard, coordMode: SudokuCoordMode): string {
  const parts: string[] = [];

  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS}" height="${CANVAS}" viewBox="0 0 ${CANVAS} ${CANVAS}">`,
  );

  // Canvas background
  parts.push(`<rect width="${CANVAS}" height="${CANVAS}" fill="#f0f0f5"/>`);

  // Board background
  parts.push(
    `<rect x="${BORDER}" y="${BORDER}" width="${CELL * 9}" height="${CELL * 9}" fill="#ffffff"/>`,
  );

  // Cells
  for (let i = 0; i < 81; i++) {
    const row = Math.floor(i / 9);
    const col = i % 9;
    const x = BORDER + col * CELL;
    const y = BORDER + row * CELL;

    const isGiven = game.puzzle[i] !== "-";
    const boardChar = game.board[i];
    const isFilled = boardChar !== "-";
    const isCorrect = isFilled && !isGiven && boardChar === game.solution[i];
    const isWrong = isFilled && !isGiven && boardChar !== game.solution[i];

    // Cell background
    if (isGiven) {
      parts.push(`<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" fill="#e8e8e8"/>`);
    } else if (isCorrect) {
      parts.push(`<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" fill="#d4eaf7"/>`);
    } else if (isWrong) {
      parts.push(`<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" fill="#fde8e8"/>`);
    }

    // Coord label (top-left corner)
    const coordLabel = indexToCoord(i, coordMode);
    parts.push(
      `<text x="${x + 3}" y="${y + 11}" font-family="monospace" font-size="9" fill="#aaaaaa">${coordLabel}</text>`,
    );

    // Number
    if (isFilled) {
      const num = isGiven ? game.puzzle[i] : boardChar;
      const textColor = isGiven ? "#1a1a1a" : isCorrect ? "#1a6fb5" : "#c0392b";
      const fontWeight = isGiven ? "bold" : "normal";
      parts.push(
        `<text x="${x + 30}" y="${y + 44}" font-family="monospace" font-size="36" font-weight="${fontWeight}" text-anchor="middle" fill="${textColor}">${num}</text>`,
      );
    }
  }

  // Grid lines (drawn last, on top of cells)
  for (let i = 0; i <= 9; i++) {
    const pos = BORDER + i * CELL;
    const isBox = i % 3 === 0;
    const strokeWidth = isBox ? 2 : 0.5;
    const stroke = isBox ? "#444444" : "#cccccc";

    // Horizontal
    parts.push(
      `<line x1="${BORDER}" y1="${pos}" x2="${BORDER + CELL * 9}" y2="${pos}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`,
    );
    // Vertical
    parts.push(
      `<line x1="${pos}" y1="${BORDER}" x2="${pos}" y2="${BORDER + CELL * 9}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`,
    );
  }

  parts.push("</svg>");
  return parts.join("\n");
}

export async function renderBoard(
  game: SudokuGameBoard,
  coordMode: SudokuCoordMode,
): Promise<Buffer> {
  const svg = buildSvg(game, coordMode);
  return sharp(Buffer.from(svg)).png().toBuffer();
}
