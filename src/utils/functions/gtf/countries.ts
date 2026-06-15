import { RestCountries } from "@yusifaliyevpro/countries";
import { RedisCache } from "../../cache";
import Constants from "../../Constants";
import ms = require("ms");

const countries = new RestCountries({ apiKey: process.env.COUNTRIES_API_KEY! });
const COUNTRY_FIELDS = ["names", "codes", "population", "flag", "continents"] as const;
const COUNTRY_DATA_CACHE_TTL_SECONDS = ms("365 days") / 1000;
const COUNTRY_VALID_NAMES_CACHE_TTL_SECONDS = ms("365 days") / 1000;
const countryDataCache = new RedisCache<CountryData>(
  Constants.redis.cache.COUNTRY_DATA,
  COUNTRY_DATA_CACHE_TTL_SECONDS,
);
const countryValidNamesCache = new RedisCache<string>(
  Constants.redis.cache.COUNTRY_VALID_NAMES,
  COUNTRY_VALID_NAMES_CACHE_TTL_SECONDS,
);

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
  const validNameCache = await countryValidNamesCache.get(countryLower);
  const cache = await countryDataCache.get(validNameCache || countryLower);

  if (cache) {
    return cache;
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

      await countryDataCache.set(normalizedOfficial, byCode);
      await countryValidNamesCache.set(countryLower, normalizedOfficial);

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

    await countryDataCache.set(normalizedOfficial, byName);

    if (countryLower !== normalizedOfficial) {
      await countryValidNamesCache.set(countryLower, normalizedOfficial);
    }

    return byName;
  }
}
