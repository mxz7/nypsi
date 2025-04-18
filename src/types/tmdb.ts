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
  genres: { name: string }[];
  overview: string;
  id: number;
  poster_path: string;
  release_date: string;
  tagline: string;
  title: string;
  vote_average: number;
  runtime: number;
}

export interface TVDetails {
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
}
