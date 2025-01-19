import { randomInt } from "crypto";

export function shuffle<T>(array: T[]): T[] {
  const arr = [...array];

  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    const temp = arr[i];
    arr[i] = arr[j];
    arr[j] = temp;
  }
  return arr;
}

export function percentChance(percent: number) {
  if (percent <= 0) return false;
  let max = 100;

  while (percent < 1 || Boolean(percent % 1)) {
    max *= 10;
    percent *= 10;
  }

  if (percent >= Math.floor(Math.random() * max) + 1) return true;
  return false;
}

// proves the above function is accurate at producing percent chances
// function test() {
//   let yes = 0;

//   console.time();
//   for (let i = 0; i < 100_000_000; i++) {
//     if (percentChance(1.3)) yes++;
//   }
//   console.timeEnd();

//   console.log(`${(yes / 100_000_000) * 100}%`);
// }
// test();

// rounds a number up or down randomly,
// fraction part is chance of rounding up
export function randomRound(n: number): number {
  let lower = Math.floor(n);
  return lower + +(Math.random() < n - lower);
}
