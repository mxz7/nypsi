export const SUDOKU_COORD_MODES = ["box", "coordinates"] as const;
export type SudokuCoordMode = (typeof SUDOKU_COORD_MODES)[number];
