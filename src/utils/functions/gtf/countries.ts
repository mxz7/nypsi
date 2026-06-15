import { RestCountries } from "@yusifaliyevpro/countries";
import redis from "../../../init/redis";
import Constants from "../../Constants";
import ms = require("ms");

const countries = new RestCountries({ apiKey: process.env.COUNTRIES_API_KEY! });
const COUNTRY_FIELDS = ["names", "codes", "population", "flag", "continents"] as const;

type RestCountry = {
  names: {
    common: string;
    official: string;
    alternates: string[];
  };
  codes: {
    alpha_2: string;
  };
  population: number;
  flag: {
    url_png: string;
  };
  continents: string[];
};

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

function normalizeName(value: string): string {
  return value.toLowerCase().replaceAll('"', "");
}

function mapCountryData(country: RestCountry): CountryData {
  return {
    name: {
      common: country.names.common,
      official: country.names.official,
    },
    altSpellings: country.names.alternates,
    cca2: country.codes.alpha_2,
    population: country.population,
    flags: {
      png: `https://nypsi.xyz/flag/${Buffer.from(country.codes.alpha_2).toString("hex")}`,
    },
    continents: country.continents,
  };
}

export async function fetchCountryData(country: string): Promise<CountryData | "failed"> {
  const countryLower = country.toLowerCase();
  const validNameCache = await redis.get(
    `${Constants.redis.cache.COUNTRY_VALID_NAMES}:${countryLower}`,
  );
  const cache = await redis.get(
    `${Constants.redis.cache.COUNTRY_DATA}:${validNameCache || countryLower}`,
  );

  if (cache) {
    return JSON.parse(cache) as CountryData;
  } else {
    const codeQuery = country.trim().toUpperCase();
    let byCode: CountryData | undefined;

    if (/^[A-Z]{2}$/.test(codeQuery)) {
      const res = await countries.getCountryByCode({ alpha_2: codeQuery, fields: COUNTRY_FIELDS });
      if (res.success) byCode = mapCountryData(res.country as RestCountry);
    } else if (/^[A-Z]{3}$/.test(codeQuery)) {
      const res = await countries.getCountryByCode({ alpha_3: codeQuery, fields: COUNTRY_FIELDS });
      if (res.success) byCode = mapCountryData(res.country as RestCountry);
    } else if (/^\d{3}$/.test(codeQuery)) {
      const res = await countries.getCountryByCode({ ccn3: codeQuery, fields: COUNTRY_FIELDS });
      if (res.success) byCode = mapCountryData(res.country as RestCountry);
    }

    if (byCode) {
      const normalizedOfficial = normalizeName(byCode.name.official);

      await redis.set(
        `${Constants.redis.cache.COUNTRY_DATA}:${normalizedOfficial}`,
        JSON.stringify(byCode),
        "EX",
        ms("21 days") / 1000,
      );

      await redis.set(
        `${Constants.redis.cache.COUNTRY_VALID_NAMES}:${countryLower}`,
        normalizedOfficial,
        "EX",
        ms("3 days") / 1000,
      );

      return byCode;
    }

    const byNameRes = await countries.getCountriesByName({
      name: country,
      fields: COUNTRY_FIELDS,
    });

    if (!byNameRes.success || byNameRes.countries.length === 0) {
      return "failed";
    }

    const byName = mapCountryData(byNameRes.countries[0] as RestCountry);
    const normalizedOfficial = normalizeName(byName.name.official);

    await redis.set(
      `${Constants.redis.cache.COUNTRY_DATA}:${normalizedOfficial}`,
      JSON.stringify(byName),
      "EX",
      ms("21 days") / 1000,
    );

    if (countryLower !== normalizedOfficial) {
      await redis.set(
        `${Constants.redis.cache.COUNTRY_VALID_NAMES}:${countryLower}`,
        normalizedOfficial,
        "EX",
        ms("3 days") / 1000,
      );
    }

    return byName;
  }
}
