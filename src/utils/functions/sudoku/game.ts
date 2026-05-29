import { getSudoku } from "sudoku-gen";
import { SudokuCoordMode, SudokuDifficulty, SudokuGame } from "#generated/prisma";
import prisma from "../../../init/database";
import { addProgress } from "../economy/achievements";
import { addTaskProgress } from "../economy/tasks";
import { getPreferences, updatePreferences } from "../users/notifications";
import {
  decodeCellChar,
  EMPTY_CELL_CHAR,
  encodeNoteMask,
  sanitizeBoardString,
  toggleNoteMask,
} from "./cell";

export { SudokuCoordMode, SudokuDifficulty, SudokuGame };

/**
 * Convert a player coordinate string to a 0-80 grid index.
 *
 * Box mode  — "A5": box A (0-8, reading order), cell 5 (1-9, reading order)
 * Coord mode — "C3": column C (A=0..I=8), row 3 (1=top..9=bottom)
 *
 * Returns null for out-of-range or malformed input.
 */
export function coordToIndex(coord: string, coordMode: SudokuCoordMode): number | null {
  if (!coord || coord.length !== 2) return null;

  const first = coord[0].toUpperCase();
  const second = coord[1];

  if (coordMode === "box") {
    const boxIndex = first.charCodeAt(0) - "A".charCodeAt(0);
    if (boxIndex < 0 || boxIndex > 8) return null;

    const cellNum = parseInt(second, 10);
    if (isNaN(cellNum) || cellNum < 1 || cellNum > 9) return null;

    const cellIndex = cellNum - 1;
    const boxRow = Math.floor(boxIndex / 3);
    const boxCol = boxIndex % 3;
    const cellRow = Math.floor(cellIndex / 3);
    const cellCol = cellIndex % 3;

    return (boxRow * 3 + cellRow) * 9 + (boxCol * 3 + cellCol);
  } else {
    const col = first.charCodeAt(0) - "A".charCodeAt(0);
    if (col < 0 || col > 8) return null;

    const row = parseInt(second, 10);
    if (isNaN(row) || row < 1 || row > 9) return null;

    return (row - 1) * 9 + col;
  }
}

/**
 * Convert a 0-80 grid index to the coordinate label shown in the cell corner.
 */
export function indexToCoord(index: number, coordMode: SudokuCoordMode): string {
  const row = Math.floor(index / 9);
  const col = index % 9;

  if (coordMode === "box") {
    const boxRow = Math.floor(row / 3);
    const boxCol = Math.floor(col / 3);
    const boxIndex = boxRow * 3 + boxCol;
    const cellRow = row % 3;
    const cellCol = col % 3;
    const cellIndex = cellRow * 3 + cellCol;
    return String.fromCharCode("A".charCodeAt(0) + boxIndex) + (cellIndex + 1).toString();
  } else {
    return String.fromCharCode("A".charCodeAt(0) + col) + (row + 1).toString();
  }
}

export function isGivenCell(puzzle: string, index: number): boolean {
  return puzzle[index] !== "-";
}

export async function createSudokuGame(userId: string, difficulty: SudokuDifficulty) {
  const sudoku = getSudoku(difficulty);

  return prisma.sudokuGame.create({
    data: {
      userId,
      puzzle: sudoku.puzzle,
      solution: sudoku.solution,
      board: sudoku.puzzle,
      difficulty,
    },
  });
}

export async function getGameById(id: string) {
  const game = await prisma.sudokuGame.findUnique({ where: { id } });
  if (!game) return null;

  const sanitizedBoard = sanitizeBoardString(game.board);
  if (sanitizedBoard !== game.board) {
    return prisma.sudokuGame.update({
      where: { id: game.id },
      data: { board: sanitizedBoard },
    });
  }

  return game;
}

export async function getActiveGame(userId: string) {
  const game = await prisma.sudokuGame.findFirst({
    where: { userId, state: "active" },
    orderBy: { startedAt: "desc" },
  });

  if (!game) return null;

  const sanitizedBoard = sanitizeBoardString(game.board);
  if (sanitizedBoard !== game.board) {
    return prisma.sudokuGame.update({
      where: { id: game.id },
      data: { board: sanitizedBoard },
    });
  }

  return game;
}

export async function resignGame(id: string) {
  return prisma.sudokuGame.update({
    where: { id },
    data: { state: "resigned", completedAt: new Date() },
  });
}

export async function getUserCoordMode(userId: string): Promise<SudokuCoordMode> {
  const prefs = await getPreferences(userId);
  return prefs.sudokuCoordMode;
}

export async function setUserCoordMode(userId: string, mode: SudokuCoordMode): Promise<void> {
  const prefs = await getPreferences(userId);
  prefs.sudokuCoordMode = mode;
  await updatePreferences(userId, prefs);
}

export type ApplyMoveResult =
  | { ok: false; invalid: string }
  | { ok: true; correct: boolean; complete: boolean };

export async function applyMove(
  game: SudokuGame,
  coord: string,
  digit: number,
  coordMode: SudokuCoordMode,
): Promise<ApplyMoveResult> {
  const index = coordToIndex(coord, coordMode);
  if (index === null) return { ok: false, invalid: "invalid coordinate" };
  if (isGivenCell(game.puzzle, index))
    return { ok: false, invalid: "cannot overwrite a given cell" };
  if (digit < 1 || digit > 9) return { ok: false, invalid: "digit must be 1–9" };

  const correct = game.solution[index] === String(digit);

  const boardArr = game.board.split("");
  boardArr[index] = String(digit);
  const newBoard = boardArr.join("");

  const complete = newBoard === game.solution;

  await prisma.sudokuGame.update({
    where: { id: game.id },
    data: {
      board: newBoard,
      ...(correct ? {} : { mistakes: { increment: 1 } }),
      ...(complete ? { state: "completed", completedAt: new Date() } : {}),
    },
  });

  if (complete) {
    addTaskProgress(game.userId, "sudoku_weekly", 1);
    addProgress(game.userId, "sudoku", 1);
  }

  return { ok: true, correct, complete };
}

export async function toggleNote(
  game: SudokuGame,
  coord: string,
  digit: number,
  coordMode: SudokuCoordMode,
): Promise<{ invalid?: string }> {
  const index = coordToIndex(coord, coordMode);
  if (index === null) return { invalid: "invalid coordinate" };
  if (isGivenCell(game.puzzle, index)) return { invalid: "cannot add a note to a given cell" };

  const boardArr = game.board.split("");
  const current = decodeCellChar(boardArr[index]);
  if (current.kind === "digit") return { invalid: "cell already has a placed digit" };

  let newChar: string;
  if (digit === 0) {
    newChar = EMPTY_CELL_CHAR;
  } else {
    newChar = encodeNoteMask(toggleNoteMask(current.mask, digit));
  }

  boardArr[index] = newChar;
  const newBoard = boardArr.join("");

  await prisma.sudokuGame.update({
    where: { id: game.id },
    data: { board: newBoard },
  });

  return {};
}

export async function eraseCell(
  game: SudokuGame,
  coord: string,
  coordMode: SudokuCoordMode,
): Promise<{ invalid?: string }> {
  const index = coordToIndex(coord, coordMode);
  if (index === null) return { invalid: "invalid coordinate" };
  if (isGivenCell(game.puzzle, index)) return { invalid: "cannot erase a given cell" };

  const boardArr = game.board.split("");
  boardArr[index] = EMPTY_CELL_CHAR;
  const newBoard = boardArr.join("");

  await prisma.sudokuGame.update({
    where: { id: game.id },
    data: { board: newBoard },
  });

  return {};
}

export type SudokuStats = {
  gamesStarted: number;
  gamesCompleted: number;
  solvePercent: number;
  avgMistakes: number;
  byDifficulty: {
    difficulty: SudokuDifficulty;
    completed: number;
    fastestMs: number | null;
    avgMs: number | null;
  }[];
};

export async function getSudokuStats(userId: string): Promise<SudokuStats> {
  const [totals, completedGames] = await Promise.all([
    prisma.sudokuGame.aggregate({
      where: { userId },
      _count: { _all: true },
      _avg: { mistakes: true },
    }),
    prisma.sudokuGame.findMany({
      where: { userId, state: "completed" },
      select: { difficulty: true, startedAt: true, completedAt: true },
    }),
  ]);

  const gamesStarted = totals._count._all;
  const gamesCompleted = completedGames.length;

  const byDifficultyMap = new Map<SudokuDifficulty, { completed: number; times: number[] }>();

  for (const game of completedGames) {
    const elapsed = game.completedAt ? game.completedAt.getTime() - game.startedAt.getTime() : 0;
    const entry = byDifficultyMap.get(game.difficulty) ?? { completed: 0, times: [] };
    entry.completed++;
    entry.times.push(elapsed);
    byDifficultyMap.set(game.difficulty, entry);
  }

  const byDifficulty = Array.from(byDifficultyMap.entries()).map(([difficulty, data]) => ({
    difficulty,
    completed: data.completed,
    fastestMs: data.times.length > 0 ? Math.min(...data.times) : null,
    avgMs:
      data.times.length > 0
        ? Math.round(data.times.reduce((a, b) => a + b, 0) / data.times.length)
        : null,
  }));

  return {
    gamesStarted,
    gamesCompleted,
    solvePercent: gamesStarted > 0 ? Math.round((gamesCompleted / gamesStarted) * 100) : 0,
    avgMistakes: Math.round((totals._avg.mistakes ?? 0) * 10) / 10,
    byDifficulty,
  };
}
