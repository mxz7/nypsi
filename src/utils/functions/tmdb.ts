import ms = require("ms");
import prisma from "../../init/database";
import redis from "../../init/redis";
import {
  CountryProvider,
  MovieDetails,
  MovieSearch,
  TVDetails,
  TVSearch,
  TVSeasonEpisodeDetails,
} from "../../types/tmdb";
import { RedisCache } from "../cache";
import Constants from "../Constants";
import { addTaskProgress } from "./economy/tasks";
import { getUserId, MemberResolvable } from "./member";

const BASE = "https://api.themoviedb.org/3";
const CACHE_TTL_SECONDS = ms("1 day") / 1000;
const movieSearchCache = new RedisCache<MovieSearch>(
  Constants.redis.cache.tmdb.MOVIE_SEARCH,
  CACHE_TTL_SECONDS,
);
const tvSearchCache = new RedisCache<TVSearch>(
  Constants.redis.cache.tmdb.TV_SEARCH,
  CACHE_TTL_SECONDS,
);
const movieCache = new RedisCache<MovieDetails>(
  Constants.redis.cache.tmdb.MOVIE,
  CACHE_TTL_SECONDS,
);
const tvCache = new RedisCache<TVDetails>(Constants.redis.cache.tmdb.TV, CACHE_TTL_SECONDS);
const tvEpisodesCache = new RedisCache<TVSeasonEpisodeDetails[]>(
  Constants.redis.cache.tmdb.TV_EPISODES,
  CACHE_TTL_SECONDS,
);

export async function movieSearch(query: string): Promise<MovieSearch | "unavailable" | number> {
  const cache = await movieSearchCache.get(query);

  if (cache) return cache;

  if (await redis.exists("nypsi:tmdb:ratelimit")) return "unavailable";

  const response = await fetch(`${BASE}/search/movie?query=${query}`, {
    headers: {
      Authorization: `Bearer ${process.env.TMDB_KEY}`,
    },
  });

  if (response.ok && response.status === 200) {
    const data: MovieSearch = await response.json();

    await movieSearchCache.set(query, data);

    return data;
  }

  if (response.status === 429)
    await redis.set("nypsi:tmdb:ratelimit", "t", "EX", ms("10 minutes") / 1000);

  return response.status;
}

export async function tvSearch(query: string): Promise<TVSearch | "unavailable" | number> {
  const cache = await tvSearchCache.get(query);

  if (cache) return cache;

  if (await redis.exists("nypsi:tmdb:ratelimit")) return "unavailable";

  const response = await fetch(`${BASE}/search/tv?query=${query}`, {
    headers: {
      Authorization: `Bearer ${process.env.TMDB_KEY}`,
    },
  });

  if (response.ok && response.status === 200) {
    const data: TVSearch = await response.json();

    await tvSearchCache.set(query, data);

    return data;
  }

  if (response.status === 429)
    await redis.set("nypsi:tmdb:ratelimit", "t", "EX", ms("10 minutes") / 1000);

  return response.status;
}

export async function getMovie(id: number): Promise<MovieDetails | "unavailable" | number> {
  const cache = await movieCache.get(id.toString());

  if (cache) return cache;

  if (await redis.exists("nypsi:tmdb:ratelimit")) return "unavailable";

  const response = await fetch(
    `${BASE}/movie/${id}?append_to_response=credits%2Cwatch%2Fproviders`,
    {
      headers: {
        Authorization: `Bearer ${process.env.TMDB_KEY}`,
      },
    },
  );

  if (response.ok && response.status === 200) {
    const data = (await response.json()) as MovieDetails & { "watch/providers": unknown };
    data.type = "movie";
    data.providers = transformProviders(data["watch/providers"]);
    data["watch/providers"] = undefined;

    await movieCache.set(id.toString(), data);

    return data;
  }

  if (response.status === 429)
    await redis.set("nypsi:tmdb:ratelimit", "t", "EX", ms("10 minutes") / 1000);

  return response.status;
}

export async function getTv(id: number): Promise<TVDetails | "unavailable" | number> {
  const cache = await tvCache.get(id.toString());

  if (cache) return cache;

  if (await redis.exists("nypsi:tmdb:ratelimit")) return "unavailable";

  const response = await fetch(`${BASE}/tv/${id}?append_to_response=credits%2Cwatch%2Fproviders`, {
    headers: {
      Authorization: `Bearer ${process.env.TMDB_KEY}`,
    },
  });

  if (response.ok && response.status === 200) {
    const data = (await response.json()) as TVDetails & { "watch/providers": unknown };
    data.type = "tv";
    data.providers = transformProviders(data["watch/providers"]);
    data["watch/providers"] = undefined;

    await tvCache.set(id.toString(), data);

    return data;
  }

  if (response.status === 429)
    await redis.set("nypsi:tmdb:ratelimit", "t", "EX", ms("10 minutes") / 1000);

  return response.status;
}

export async function getEpisodes(
  id: number,
  season: number,
): Promise<TVSeasonEpisodeDetails[] | "unavailable" | number> {
  const cache = await tvEpisodesCache.get(`${id}:${season}`);

  if (cache) return cache;

  if (await redis.exists("nypsi:tmdb:ratelimit")) return "unavailable";

  const response = await fetch(`${BASE}/tv/${id}/season/${season}`, {
    headers: {
      Authorization: `Bearer ${process.env.TMDB_KEY}`,
    },
  });

  if (response.ok && response.status === 200) {
    const data = (await response.json()).episodes;

    await tvEpisodesCache.set(`${id}:${season}`, data);

    return data;
  }

  if (response.status === 429)
    await redis.set("nypsi:tmdb:ratelimit", "t", "EX", ms("10 minutes") / 1000);

  return response.status;
}

function transformProviders(providerData: any): CountryProvider[] {
  const results = providerData.results;

  return Object.entries(results).map(([countryCode, data]) => {
    const { rent, buy, flatrate } = data as {
      rent?: any[];
      buy?: any[];
      flatrate?: any[];
    };

    const transformList = (list?: any[]) =>
      list?.map(({ provider_id, provider_name, display_priority }) => ({
        provider_id,
        provider_name,
        display_priority,
      }));

    return {
      countryCode,
      ...(rent ? { rent: transformList(rent) } : {}),
      ...(buy ? { buy: transformList(buy) } : {}),
      ...(flatrate ? { flatrate: transformList(flatrate) } : {}),
    };
  });
}

export async function setUserRating(
  member: MemberResolvable,
  type: "movie" | "tv",
  id: number,
  name: string,
  rating: number | "reset",
) {
  const userId = getUserId(member);

  if (rating == "reset") {
    return await prisma.tmdbRatings.deleteMany({ where: { userId, type, id } });
  }

  addTaskProgress(userId, "rate_daily");

  return await prisma.tmdbRatings.upsert({
    where: { userId_type_id: { userId, type, id } },
    update: { rating },
    create: { userId, rating, id, name, type },
  });
}

export async function getRating(type: "movie" | "tv", id: number) {
  const res = await prisma.tmdbRatings.findMany({
    where: {
      id,
      type,
    },
    select: {
      rating: true,
    },
  });

  return {
    count: res.length,
    average: res.length
      ? (res.reduce((acc, res) => acc + res.rating.toNumber(), 0) / res.length) * 2
      : 0,
  };
}

export async function getUserRatings(
  member: MemberResolvable,
  type: "movie" | "tv",
  id: number,
): Promise<number>;
export async function getUserRatings(
  member: MemberResolvable,
  type?: "movie" | "tv",
): Promise<{ name: string; rating: number }[]>;
export async function getUserRatings(member: MemberResolvable, type?: "movie" | "tv", id?: number) {
  const userId = getUserId(member);

  if (id)
    return (
      (
        await prisma.tmdbRatings.findUnique({
          where: { userId_type_id: { userId, type, id } },
          select: { rating: true },
        })
      )?.rating.toNumber() ?? -1
    );

  return (
    await prisma.tmdbRatings.findMany({
      where: type ? { userId, type } : { userId },
      select: { name: true, rating: true },
    })
  ).map((i) => ({ name: i.name, rating: i.rating.toNumber() }));
}
