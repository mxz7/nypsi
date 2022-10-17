import redis from "../../init/redis";
import { daysUntilChristmas } from "./date";

export function randomPresence(): string {
  const possibilities = ["nypsi.xyz", "tekoh.net", "nypsi.xyz", "xmas", "xmas"];

  const chosen = possibilities[Math.floor(Math.random() * possibilities.length)];

  let game = "";

  if (chosen === "xmas") {
    game = `${daysUntilChristmas()} days until christmas`;
  } else {
    game = chosen;
  }

  return game;
}

export async function getCustomPresence() {
  return await redis.get("nypsi:presence");
}

export async function setCustomPresence(text?: string) {
  await redis.set("nypsi:presence", text);
}
