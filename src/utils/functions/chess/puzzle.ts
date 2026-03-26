import { Chess } from "chess.js";
import prisma from "../../../init/database";

export interface LichessPuzzle {
  game: {
    id: string;
    pgn: string;
    players: { name: string; color: string; rating: number }[];
  };
  puzzle: {
    id: string;
    rating: number;
    plays: number;
    solution: string[];
    themes: string[];
    initialPly: number;
  };
}

export async function getRandomPuzzle(): Promise<LichessPuzzle | "unavailable"> {
  const response = await fetch("https://lichess.org/api/puzzle/next", {
    headers: { Accept: "application/json" },
  });

  if (response.ok && response.status === 200) {
    return response.json() as Promise<LichessPuzzle>;
  }

  return "unavailable";
}

export function buildChessFromPuzzle(puzzle: LichessPuzzle): Chess {
  const source = new Chess();
  source.loadPgn(puzzle.game.pgn);

  const history = source.history({ verbose: true });
  const firstSolution = puzzle.puzzle.solution[0];

  const buildAtPly = (pliesToReplay: number): Chess => {
    const chess = new Chess();
    const capped = Math.max(0, Math.min(pliesToReplay, history.length));

    for (let i = 0; i < capped; i++) {
      chess.move(history[i]);
    }

    return chess;
  };

  const isSolutionMoveLegal = (chess: Chess, uci: string): boolean => {
    const legal = chess.moves({ verbose: true }).map((m) => m.from + m.to + (m.promotion ?? ""));

    return legal.includes(uci);
  };

  // Lichess uses 1-based ply indexing for `initialPly`, but in practice some
  // payloads can be off by one relative to chess.js PGN replay. Prefer nearby
  // candidates where the first solution move is legal.
  const candidates = [
    puzzle.puzzle.initialPly - 1,
    puzzle.puzzle.initialPly,
    puzzle.puzzle.initialPly - 2,
    puzzle.puzzle.initialPly + 1,
  ];

  for (const candidate of candidates) {
    const chess = buildAtPly(candidate);
    if (firstSolution && isSolutionMoveLegal(chess, firstSolution)) {
      return chess;
    }
  }

  // Fallback to the standard 1-based interpretation.
  return buildAtPly(puzzle.puzzle.initialPly - 1);
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

export async function recordSolve(userId: string) {
  const existing = await prisma.chessPuzzleStats.findUnique({ where: { userId } });
  const newStreak = (existing?.streak ?? 0) + 1;
  const newBest = Math.max(newStreak, existing?.bestStreak ?? 0);

  await prisma.chessPuzzleStats.upsert({
    where: { userId },
    create: { userId, solved: 1, streak: 1, bestStreak: 1 },
    update: { solved: { increment: 1 }, streak: newStreak, bestStreak: newBest },
  });
}

export async function recordFail(userId: string) {
  await prisma.chessPuzzleStats.upsert({
    where: { userId },
    create: { userId, failed: 1, streak: 0 },
    update: { failed: { increment: 1 }, streak: 0 },
  });
}
