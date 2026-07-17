export function applyPassiveBakePenalty(min: number, max: number): [number, number] {
  const originalMax = max;

  max -= 2;

  if (max > 10) max -= 5;
  if (max > 30) max -= 5;
  if (max > 50) max -= 5;
  if (max > 100) max *= 0.75;
  if (max > 100) max -= 10;

  const penalty = originalMax - max;

  return [Math.max(1, min - penalty), Math.max(1, max)];
}
