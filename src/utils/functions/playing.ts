import redis from "../../init/redis";
import Constants from "../Constants";

export async function setUserPlaying(id: string, game: string): Promise<void> {
  await redis.hset(Constants.redis.nypsi.USERS_PLAYING, id, game);
}

export async function removeUserPlaying(id: string): Promise<void> {
  await redis.hdel(Constants.redis.nypsi.USERS_PLAYING, id);
}

export async function getUserPlaying(id: string): Promise<string | null> {
  return redis.hget(Constants.redis.nypsi.USERS_PLAYING, id);
}

export async function getPlayingCount(): Promise<number> {
  return redis.hlen(Constants.redis.nypsi.USERS_PLAYING);
}
