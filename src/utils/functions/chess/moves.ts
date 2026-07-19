import { Chess } from "chess.js";

export function normalizeToUci(input: string, chess: Chess): string | null {
  const clone = new Chess(chess.fen());
  input = input.trim();

  const uciMatch = input.match(/^([a-h][1-8])([a-h][1-8])([qrbn]?)$/i);
  if (uciMatch) {
    const [, rawFrom, rawTo, rawPromotion] = uciMatch;
    const from = rawFrom.toLowerCase();
    const to = rawTo.toLowerCase();
    const promotion = rawPromotion.toLowerCase();

    try {
      const move = clone.move({ from, to, promotion: promotion || undefined });
      if (move) return move.from + move.to + (move.promotion ?? "");
    } catch {
      // Fall through to SAN parsing.
    }
  }

  try {
    const move = clone.move(input);
    if (move) return move.from + move.to + (move.promotion ?? "");
  } catch {
    // Invalid or illegal move.
  }

  return null;
}
