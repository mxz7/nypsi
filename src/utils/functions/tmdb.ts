import ms = require("ms");
import redis from "../../init/redis";
import {
  CountryProvider,
  MovieDetails,
  MovieSearch,
  TVDetails,
  TVSearch,
  TVSeasonEpisodeDetails,
} from "../../types/tmdb";
import { GuildMember } from "discord.js";
import Constants from "../Constants";
import prisma from "../../init/database";

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

export async function getMovie(id: number): Promise<MovieDetails | "unavailable" | number> {
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

  const providersRes = await fetch(`${BASE}/movie/${id}/watch/providers`, {
    headers: {
      Authorization: `Bearer ${process.env.TMDB_KEY}`,
    },
  });

  if (response.ok && response.status === 200 && providersRes.ok && providersRes.status == 200) {
    const data = await response.json();
    data.type = "movie";
    data.providers = transformProviders(await providersRes.json());

    await redis.set(
      `${Constants.redis.cache.tmdb.MOVIE}:${id}`,
      JSON.stringify(data),
      "EX",
      ms("1 day") / 1000,
    );

    return data;
  }

  if (response.status === 429 || providersRes.status == 429)
    await redis.set("nypsi:tmdb:ratelimit", "t", "EX", ms("10 minutes") / 1000);

  return response.ok ? providersRes.status : response.status;
}

export async function getTv(id: number): Promise<TVDetails | "unavailable" | number> {
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

  const providersRes = await fetch(`${BASE}/tv/${id}/watch/providers`, {
    headers: {
      Authorization: `Bearer ${process.env.TMDB_KEY}`,
    },
  });

  if (response.ok && response.status === 200 && providersRes.ok && providersRes.status == 200) {
    const data = await response.json();
    data.type = "tv";
    data.providers = transformProviders(await providersRes.json());

    await redis.set(
      `${Constants.redis.cache.tmdb.TV}:${id}`,
      JSON.stringify(data),
      "EX",
      ms("1 day") / 1000,
    );

    return data;
  }

  if (response.status === 429 || providersRes.status == 429)
    await redis.set("nypsi:tmdb:ratelimit", "t", "EX", ms("10 minutes") / 1000);

  return response.ok ? providersRes.status : response.status;
}

export async function getEpisodes(
  id: number,
  season: number,
): Promise<TVSeasonEpisodeDetails[] | "unavailable" | number> {
  const cache = await redis.get(`${Constants.redis.cache.tmdb.TV_EPISODES}:${id}:${season}`);

  if (cache) {
    return JSON.parse(cache);
  }

  if (await redis.exists("nypsi:tmdb:ratelimit")) return "unavailable";

  const response = await fetch(`${BASE}/tv/${id}/season/${season}`, {
    headers: {
      Authorization: `Bearer ${process.env.TMDB_KEY}`,
    },
  });

  if (response.ok && response.status === 200) {
    const data = (await response.json()).episodes;

    await redis.set(
      `${Constants.redis.cache.tmdb.TV_EPISODES}:${id}:${season}`,
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
  member: GuildMember | string,
  type: "movie" | "tv",
  id: number,
  rating: number | "reset",
) {
  let userId: string;
  if (member instanceof GuildMember) {
    userId = member.user.id;
  } else {
    userId = member;
  }

  if (rating == "reset") {
    return await prisma.tmdbRatings.deleteMany({ where: { userId, type, id } });
  }

  return await prisma.tmdbRatings.upsert({
    where: { userId_type_id: { userId, type, id } },
    update: { rating },
    create: { userId, rating, id, type },
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
    average: res.length ? res.reduce((acc, res) => acc + res.rating, 0) / res.length : 0,
  };
}

export async function getUserRating(
  member: GuildMember | string,
  type: "movie" | "tv",
  id: number,
) {
  let userId: string;
  if (member instanceof GuildMember) {
    userId = member.user.id;
  } else {
    userId = member;
  }

  return (
    (
      await prisma.tmdbRatings.findUnique({
        where: { userId_type_id: { userId, type, id } },
        select: { rating: true },
      })
    )?.rating ?? -1
  );
}
