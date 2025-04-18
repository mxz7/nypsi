import ms = require("ms");
import redis from "../../init/redis";
import { MovieDetails, MovieSearch, TVDetails, TVSearch } from "../../types/tmdb";
import Constants from "../Constants";

const BASE = "https://api.themoviedb.org/3";

export async function movieSearch(query: string): Promise<MovieSearch | "unavailable" | number> {
  const cache = await redis.get(`${Constants.redis.cache.tmdb.MOVIE_SEARCH}:${query}`);

  if (cache) {
    return JSON.parse(cache);
  }

  if (await redis.exists("nypsi:tmdb:ratelimit")) return "unavailable";

  const response = await fetch(`${BASE}/search/movie?query=${query}`, {
    headers: {
      Authorization: `Bearer ${process.env.TMDB_KEY}`,
    },
  });

  if (response.ok && response.status === 200) {
    const data: MovieSearch = await response.json();

    await redis.set(
      `${Constants.redis.cache.tmdb.MOVIE_SEARCH}:${query}`,
      JSON.stringify(data),
      "EX",
      ms("1 day") / 1000,
    );

    return data;
  }

  if (response.status === 429)
    await redis.set("nypsi:tmdb:ratelimit", "t", "EX", ms("10 minutes") / 1000);

  return response.status;
}

export async function tvSearch(query: string): Promise<TVSearch | "unavailable" | number> {
  const cache = await redis.get(`${Constants.redis.cache.tmdb.TV_SEARCH}:${query}`);

  if (cache) {
    return JSON.parse(cache);
  }

  if (await redis.exists("nypsi:tmdb:ratelimit")) return "unavailable";

  const response = await fetch(`${BASE}/search/tv?query=${query}`, {
    headers: {
      Authorization: `Bearer ${process.env.TMDB_KEY}`,
    },
  });

  if (response.ok && response.status === 200) {
    const data: TVSearch = await response.json();

    await redis.set(
      `${Constants.redis.cache.tmdb.TV_SEARCH}:${query}`,
      JSON.stringify(data),
      "EX",
      ms("1 day") / 1000,
    );

    return data;
  }

  if (response.status === 429)
    await redis.set("nypsi:tmdb:ratelimit", "t", "EX", ms("10 minutes") / 1000);

  return response.status;
}

export async function getMovie(id: string): Promise<MovieDetails | "unavailable" | number> {
  const cache = await redis.get(`${Constants.redis.cache.tmdb.MOVIE}:${id}`);

  if (cache) {
    return JSON.parse(cache);
  }

  if (await redis.exists("nypsi:tmdb:ratelimit")) return "unavailable";

  const response = await fetch(`${BASE}/movie/${id}`, {
    headers: {
      Authorization: `Bearer ${process.env.TMDB_KEY}`,
    },
  });

  if (response.ok && response.status === 200) {
    const data = await response.json();

    await redis.set(
      `${Constants.redis.cache.tmdb.MOVIE}:${id}`,
      JSON.stringify(data),
      "EX",
      ms("1 day") / 1000,
    );

    return data;
  }

  if (response.status === 429)
    await redis.set("nypsi:tmdb:ratelimit", "t", "EX", ms("10 minutes") / 1000);

  return response.status;
}

export async function getTv(id: string): Promise<TVDetails | "unavailable" | number> {
  const cache = await redis.get(`${Constants.redis.cache.tmdb.TV}:${id}`);

  if (cache) {
    return JSON.parse(cache);
  }

  if (await redis.exists("nypsi:tmdb:ratelimit")) return "unavailable";

  const response = await fetch(`${BASE}/tv/${id}`, {
    headers: {
      Authorization: `Bearer ${process.env.TMDB_KEY}`,
    },
  });

  if (response.ok && response.status === 200) {
    const data = await response.json();

    await redis.set(
      `${Constants.redis.cache.tmdb.TV}:${id}`,
      JSON.stringify(data),
      "EX",
      ms("1 day") / 1000,
    );

    return data;
  }

  if (response.status === 429)
    await redis.set("nypsi:tmdb:ratelimit", "t", "EX", ms("10 minutes") / 1000);

  return response.status;
}
