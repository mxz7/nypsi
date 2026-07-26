import redis from "../../../init/redis";
import Constants from "../../Constants";

const MIN = 86_400;
const MAX = MIN * 3;

export async function hasGemBeenGiven() {
  return Boolean(await redis.exists(Constants.redis.nypsi.GEM_GIVEN));
}

export async function markGemAsGiven() {
  const duration = Math.floor(Math.random() * MAX - MIN) + MIN;
  await redis.set(Constants.redis.nypsi.GEM_GIVEN, "t", "EX", duration);
}
