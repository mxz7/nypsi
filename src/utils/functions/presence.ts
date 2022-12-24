import redis from "../../init/redis";
import Constants from "../Constants";
import { daysUntilChristmas } from "./date";

export function randomPresence(): string {
  const possibilities = ["nypsi.xyz", "tekoh.net", "nypsi.xyz", "xmas", "nypsi.xyz"];

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
  return await redis.get(Constants.redis.nypsi.PRESENCE);
}

export async function setCustomPresence(text?: string) {
  await redis.set(Constants.redis.nypsi.PRESENCE, text);
}
