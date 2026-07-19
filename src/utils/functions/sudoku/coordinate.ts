export type SudokuCoordinateMode = "box" | "coordinates";

export function coordToIndex(coord: string, coordMode: SudokuCoordinateMode): number | null {
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
  }

  const col = first.charCodeAt(0) - "A".charCodeAt(0);
  if (col < 0 || col > 8) return null;

  const row = parseInt(second, 10);
  if (isNaN(row) || row < 1 || row > 9) return null;

  return (row - 1) * 9 + col;
}

export function indexToCoord(index: number, coordMode: SudokuCoordinateMode): string {
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
  }

  return String.fromCharCode("A".charCodeAt(0) + col) + (row + 1).toString();
}

export function isGivenCell(puzzle: string, index: number): boolean {
  return puzzle[index] !== "-";
}
