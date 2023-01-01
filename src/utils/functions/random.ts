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
  if (percent >= 100) throw new TypeError("percent must be less than 100");
  if (percent < 0.0001) throw new TypeError("cannot accurately create a chance less than 0.0001%");
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
