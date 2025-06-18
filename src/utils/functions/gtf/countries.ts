import { getCountriesByName, getCountryByCode } from "@yusifaliyevpro/countries";
import redis from "../../../init/redis";
import Constants from "../../Constants";
import ms = require("ms");

export interface CountryData {
  name: {
    common: string;
    official: string;
  };
  altSpellings: string[];
  cca2: string;
  population: number;
  flags: {
    png: string;
  };
  continents: string[];
}

export async function fetchCountryData(country: string): Promise<CountryData | "failed"> {
  const validNameCache = await redis.get(
    `${Constants.redis.cache.COUNTRY_VALID_NAMES}:${country.toLowerCase()}`,
  );
  const cache = await redis.get(
    `${Constants.redis.cache.COUNTRY_DATA}:${validNameCache || country.toLowerCase()}`,
  );

  if (cache) {
    return JSON.parse(cache) as CountryData;
  } else {
    const res = await getCountryByCode({
      code: country,
      fields: ["altSpellings", "name", "cca2", "cca3", "population", "flags", "continents"],
    });

    if (res) {
      await redis.set(
        `${Constants.redis.cache.COUNTRY_DATA}:${res.name.official.toLowerCase().replaceAll('"', "")}`,
        JSON.stringify(res),
        "EX",
        ms("21 days") / 1000,
      );

      await redis.set(
        `${Constants.redis.cache.COUNTRY_VALID_NAMES}:${country.toLowerCase()}`,
        res.name.official.toLowerCase().replaceAll('"', ""),
        "EX",
        ms("3 days") / 1000,
      );

      return res;
    } else {
      const res = await getCountriesByName({
        name: country,
        fields: ["altSpellings", "name", "cca2", "cca3", "population", "flags", "continents"],
      });

      if (res?.length) {
        await redis.set(
          `${Constants.redis.cache.COUNTRY_DATA}:${res[0].name.official.toLowerCase().replaceAll('"', "")}`,
          JSON.stringify(res[0]),
          "EX",
          ms("21 days") / 1000,
        );

        if (country.toLowerCase() !== res[0].name.official.toLowerCase().replaceAll('"', ""))
          await redis.set(
            `${Constants.redis.cache.COUNTRY_VALID_NAMES}:${country.toLowerCase()}`,
            res[0].name.official.toLowerCase().replaceAll('"', ""),
            "EX",
            ms("3 days") / 1000,
          );
        return res[0];
      } else {
        return `failed`;
      }
    }
  }
}
