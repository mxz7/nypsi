export interface MovieSearch {
  page: number;
  total_results: number;
  results: { id: number; title: string; overview: string; release_date: string }[];
}

export interface TVSearch {
  page: number;
  total_results: number;
  results: { id: number; name: string; overview: string; first_air_date: string }[];
}

export interface MovieDetails {
  type: "movie";
  genres: { name: string }[];
  overview: string;
  id: number;
  poster_path: string;
  release_date: string;
  tagline: string;
  title: string;
  vote_average: number;
  runtime: number;
  providers: CountryProvider[];
}

export interface TVDetails {
  type: "tv";
  id: number;
  first_air_date: string;
  genres: { name: string }[];
  last_air_date: string;
  name: string;
  number_of_seasons: number;
  number_of_episodes: number;
  overview: string;
  poster_path: string;
  vote_average: number;
  status: string;
  tagline: string;
  seasons: {
    air_date: string;
    episode_count: number;
    name: string;
    overview: string;
    poster_path: string;
    season_number: number;
    vote_average: number;
  }[];
  providers: CountryProvider[];
}

export interface TVSeasonEpisodeDetails {
  episode_number: number;
  name: string;
  overview: string;
  runtime: number;
  vote_average: number;
  still_path: string;
  air_date: string;
}

export interface Provider {
  provider_id: number;
  provider_name: string;
  display_priority: number;
}

export interface CountryProvider {
  countryCode: string;
  rent?: Provider[];
  buy?: Provider[];
  flatrate?: Provider[];
}
