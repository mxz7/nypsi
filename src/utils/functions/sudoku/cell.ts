const NOTE_CHAR_BASE = 0xe000;
const NOTE_MASK_MAX = 0x1ff;
const NOTE_EMPTY_MASK = 0;
const BOARD_CELLS = 81;

export const EMPTY_CELL_CHAR = "-";

export type DecodedCell =
  | { kind: "digit"; digit: number; raw: string }
  | { kind: "notes"; mask: number; raw: string };

export function isRawDigitChar(char: string): boolean {
  return char >= "1" && char <= "9";
}

export function isValidNoteChar(char: string): boolean {
  if (!char || char.length !== 1) return false;

  if (char === EMPTY_CELL_CHAR) return true;

  const code = char.charCodeAt(0);
  return code >= NOTE_CHAR_BASE + 1 && code <= NOTE_CHAR_BASE + NOTE_MASK_MAX;
}

export function sanitizeCellChar(char: string): string {
  if (isRawDigitChar(char) || isValidNoteChar(char)) return char;
  return EMPTY_CELL_CHAR;
}

export function sanitizeBoardString(board: string): string {
  const chars = board.split("");
  const out: string[] = [];

  for (let i = 0; i < BOARD_CELLS; i++) {
    out.push(sanitizeCellChar(chars[i] ?? EMPTY_CELL_CHAR));
  }

  return out.join("");
}

export function decodeCellChar(char: string): DecodedCell {
  const sanitized = sanitizeCellChar(char);

  if (isRawDigitChar(sanitized)) {
    return {
      kind: "digit",
      digit: parseInt(sanitized, 10),
      raw: sanitized,
    };
  }

  if (sanitized === EMPTY_CELL_CHAR) {
    return { kind: "notes", mask: NOTE_EMPTY_MASK, raw: sanitized };
  }

  const mask = sanitized.charCodeAt(0) - NOTE_CHAR_BASE;
  return { kind: "notes", mask, raw: sanitized };
}

export function encodeNoteMask(mask: number): string {
  const bounded = Math.max(0, Math.min(NOTE_MASK_MAX, mask | 0));
  if (bounded === NOTE_EMPTY_MASK) return EMPTY_CELL_CHAR;
  return String.fromCharCode(NOTE_CHAR_BASE + bounded);
}

export function toggleNoteMask(mask: number, digit: number): number {
  if (digit < 1 || digit > 9) return mask;

  const bit = 1 << (digit - 1);
  return mask ^ bit;
}

export function hasNote(mask: number, digit: number): boolean {
  if (digit < 1 || digit > 9) return false;
  return (mask & (1 << (digit - 1))) !== 0;
}
