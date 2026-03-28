import { Chess } from "chess.js";
import prisma from "../../../init/database";
import { logger } from "../../logger";
import { addProgress } from "../economy/achievements";
import { addTaskProgress } from "../economy/tasks";

export const CHESS_PUZZLE_DIFFICULTIES = [
  "beginner",
  "easy",
  "medium",
  "hard",
  "expert",
  "grandmaster",
] as const;
const FILTERED_THEMES = new Set(["promotion", "advancedPawn", "underPromotion"]);

export type ChessPuzzleDifficulty = (typeof CHESS_PUZZLE_DIFFICULTIES)[number];

export interface ChessPuzzle {
  id: string;
  fen: string;
  initialMove: string;
  gameUrl: string;
  rating: number;
  plays: number;
  solution: string[];
  themes: string[];
}

interface RandomPuzzleApiResponse {
  puzzleId: string;
  fen: string;
  moves: string;
  rating: number;
  ratingDeviation: number;
  popularity: number;
  nbPlays: number;
  themes: string;
  gameUrl: string;
  openingTags: string[] | null;
}

export async function getRandomPuzzle(options?: {
  difficulty?: ChessPuzzleDifficulty;
}): Promise<ChessPuzzle | "unavailable"> {
  const url = new URL("https://lichess-puzzles.maxz.dev/puzzles/random");

  if (options?.difficulty) {
    url.pathname += `/${options.difficulty}`;
  }

  const maxAttempts = 5;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let response: Response;

    try {
      response = await fetch(url, {
        headers: { Accept: "application/json" },
      });
    } catch (error) {
      logger.error("chess: failed to fetch puzzle from api", { error });
      return "unavailable";
    }

    if (!response.ok || response.status !== 200) {
      logger.warn("chess: received non-ok response from api", {
        status: response.status,
      });
      return "unavailable";
    }

    const data = (await response.json()) as RandomPuzzleApiResponse;

    const moves = data.moves.trim().split(/\s+/).filter(Boolean);

    if (moves.length < 2) {
      logger.warn("chess: skipping puzzle with insufficient moves", {
        puzzleId: data.puzzleId,
        moves,
      });
      continue;
    }

    const puzzle: ChessPuzzle = {
      id: data.puzzleId,
      fen: data.fen,
      initialMove: moves[0],
      gameUrl: data.gameUrl,
      rating: data.rating,
      plays: data.nbPlays,
      solution: moves.slice(1),
      themes: data.themes.trim().split(/\s+/).filter(Boolean),
    };

    if (puzzle.themes.some((theme) => FILTERED_THEMES.has(theme))) {
      // Some themes (e.g. promotion) can be very difficult to render properly, so filter them out.
      // yeah what copilot said ^ FUCK THAT SHIT
      logger.debug("chess: skipping puzzle for filtered theme", {
        puzzle,
        attempt,
      });
      continue;
    }

    return puzzle;
  }

  logger.warn("chess: exhausted attempts while trying to fetch non-filtered puzzle");
  return "unavailable";
}

export function buildChessFromPuzzle(puzzle: ChessPuzzle): Chess {
  const chess = new Chess();

  try {
    chess.load(puzzle.fen);
  } catch (error) {
    logger.warn("chess: failed to load puzzle fen", {
      puzzleId: puzzle.id,
      fen: puzzle.fen,
      error,
    });

    return chess;
  }

  const firstMove = normalizeToUci(puzzle.initialMove, chess);

  if (!firstMove) {
    logger.warn("chess: failed to apply initial puzzle move", {
      puzzleId: puzzle.id,
      initialMove: puzzle.initialMove,
    });
    return chess;
  }

  chess.move({
    from: firstMove.slice(0, 2),
    to: firstMove.slice(2, 4),
    promotion: firstMove[4] || undefined,
  });

  if (chess.isGameOver()) {
    logger.warn("chess: puzzle is game over after initial move", {
      puzzleId: puzzle.id,
    });
  }

  return chess;
}

/**
 * Accepts either UCI (e.g. "e2e4", "e7e8q") or SAN (e.g. "Nf3", "e4").
 * Applies the move to a clone of `chess`, returns the normalized UCI string
 * (from+to[promotion]) on success, or null if the move is illegal/invalid.
 * The passed `chess` instance is NOT mutated.
 */
export function normalizeToUci(input: string, chess: Chess): string | null {
  const clone = new Chess(chess.fen());
  input = input.trim();

  // Try UCI first (4–5 chars: from + to + optional promotion)
  const uciMatch = input.match(/^([a-h][1-8])([a-h][1-8])([qrbn]?)$/i);
  if (uciMatch) {
    const [, from, to, promotion] = uciMatch;
    try {
      const move = clone.move({ from, to, promotion: promotion || undefined });
      if (move) return move.from + move.to + (move.promotion ?? "");
    } catch {
      // fall through to SAN
    }
  }

  // Try SAN
  try {
    const move = clone.move(input);
    if (move) return move.from + move.to + (move.promotion ?? "");
  } catch {
    // invalid
  }

  return null;
}

export async function getChessStats(userId: string) {
  return prisma.chessPuzzleStats.findUnique({ where: { userId } });
}

export async function addChessSolve(userId: string, puzzleRating: number, solveTimeMs: number) {
  addProgress(userId, "chess", 1);
  addTaskProgress(userId, "chess_weekly", 1);
  const existing = await getChessStats(userId);
  const solvedBefore = existing?.solved ?? 0;
  const newSolved = solvedBefore + 1;
  const newStreak = (existing?.streak ?? 0) + 1;
  const newBest = Math.max(newStreak, existing?.bestStreak ?? 0);
  const ratingTotalBefore = (existing?.averageWinningRating ?? 0) * solvedBefore;
  const newAverageWinningRating = (ratingTotalBefore + puzzleRating) / newSolved;

  const newFastestSolve =
    existing?.fastestSolve != null ? Math.min(existing.fastestSolve, solveTimeMs) : solveTimeMs;

  const newAverageSolveTime =
    solveTimeMs !== undefined
      ? ((existing?.averageSolveTime ?? 0) * solvedBefore + solveTimeMs) / newSolved
      : undefined;

  await prisma.chessPuzzleStats.upsert({
    where: { userId },
    create: {
      userId,
      solved: 1,
      streak: 1,
      bestStreak: 1,
      averageWinningRating: puzzleRating,
      fastestSolve: solveTimeMs,
      averageSolveTime: solveTimeMs,
    },
    update: {
      solved: { increment: 1 },
      streak: newStreak,
      bestStreak: newBest,
      averageWinningRating: newAverageWinningRating,
      ...(newFastestSolve !== undefined && { fastestSolve: newFastestSolve }),
      ...(newAverageSolveTime !== undefined && { averageSolveTime: newAverageSolveTime }),
    },
  });
}

export async function addChessFail(userId: string) {
  await prisma.chessPuzzleStats.upsert({
    where: { userId },
    create: { userId, failed: 1 },
    update: { failed: { increment: 1 }, streak: 0 },
  });
}
