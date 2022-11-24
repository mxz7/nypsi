export function arrayToPage<T>(arr: T[], pageLength = 10): Map<number, T[]> {
  const map = new Map<number, T[]>();

  for (const item of arr) {
    if (map.size == 0) {
      map.set(1, [item]);
    } else {
      if (map.get(map.size).length >= pageLength) {
        map.set(map.size + 1, [item]);
      } else {
        map.get(map.size).push(item);
      }
    }
  }

  return map;
}
