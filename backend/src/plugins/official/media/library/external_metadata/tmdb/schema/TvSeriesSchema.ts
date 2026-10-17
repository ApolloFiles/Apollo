import { z } from 'zod';
import {
  COMPANY_SCHEMA,
  GENRE_SCHEMA,
  IMAGES_SUB_REQUEST_SCHEMA,
  NULLABLE_IMAGE_PATH_SCHEMA,
  PRODUCTION_COUNTRY_SCHEMA,
  SPOKEN_LANGUAGE_SCHEMA,
  TITLE_SCHEMA,
} from './SharedSchemas.js';

/** @internal */
export type TvSeriesDetailsWithExtras = z.infer<typeof TV_SERIES_DETAILS_WITH_EXTRAS_SCHEMA>;

const EXTERNAL_IDS_SCHEMA = z.object({
  'imdb_id': z.string().nullable(),
  'freebase_mid': z.string().nullable(),
  'freebase_id': z.string().nullable(),
  'tvdb_id': z.int().nullable(),
  'tvrage_id': z.int().nullable(),
  'wikidata_id': z.string().nullable(),
  'facebook_id': z.string().nullable(),
  'instagram_id': z.string().nullable(),
  'twitter_id': z.string().nullable(),
});

const ALTERNATIVE_TITLES_SCHEMA = z.object({
  results: z.array(TITLE_SCHEMA),
});

const TRANSLATIONS_SCHEMA = z.object({
  translations: z.array(z.object({
    iso_3166_1: z.string(),
    iso_639_1: z.string(),
    name: z.string().nullable(),
    english_name: z.string(),
    data: z.object({
      name: z.string().nullable(),
      tagline: z.string().nullable(),
      overview: z.string().nullable(),
      homepage: z.string().nullable(),
    }),
  })),
});

const EPISODE_SCHEMA = z.object({
  id: z.int(),
  show_id: z.int(),
  season_number: z.int(),
  episode_number: z.int(),
  episode_type: z.string(),

  name: z.string().nullable(),
  overview: z.string().nullable(),
  air_date: z.string().nullable(),
  runtime: z.int().nullable(),

  still_path: NULLABLE_IMAGE_PATH_SCHEMA,

  vote_count: z.int(),
  vote_average: z.number(),

  production_code: z.string().nullable(),
});

const TV_SERIES_SCHEMA = z.object({
  id: z.int(),

  /** In general, the adult flag is to be used for hardcore pornography */
  adult: z.boolean(),
  /** Not officially documented but sent by the API, but most likely related to the `adult` flag */
  softcore: z.boolean(),
  homepage: z.string().nullable(),

  poster_path: NULLABLE_IMAGE_PATH_SCHEMA,
  backdrop_path: NULLABLE_IMAGE_PATH_SCHEMA,

  genres: z.array(GENRE_SCHEMA),

  popularity: z.number(),
  vote_count: z.int(),
  vote_average: z.number(),

  name: z.string(),
  original_name: z.string(),
  overview: z.string().nullable(),
  tagline: z.string().nullable(),

  status: z.string(),
  type: z.string(),
  in_production: z.boolean(),
  number_of_episodes: z.int(),
  number_of_seasons: z.int(),
  first_air_date: z.string().nullable(),
  last_air_date: z.string().nullable(),

  episode_run_time: z.array(z.int()),
  seasons: z.array(z.object({
    id: z.int(),

    name: z.string().nullable(),
    overview: z.string().nullable(),

    season_number: z.int(),
    episode_count: z.int(),
    air_date: z.string().nullable(),

    poster_path: NULLABLE_IMAGE_PATH_SCHEMA,

    vote_average: z.number(),
  })),
  last_episode_to_air: EPISODE_SCHEMA.nullable(),
  next_episode_to_air: EPISODE_SCHEMA.nullable(),

  original_language: z.string(),
  origin_country: z.array(z.string()),
  languages: z.array(z.string()),
  spoken_languages: z.array(SPOKEN_LANGUAGE_SCHEMA),

  production_companies: z.array(COMPANY_SCHEMA),
  production_countries: z.array(PRODUCTION_COUNTRY_SCHEMA),
  networks: z.array(COMPANY_SCHEMA),
  created_by: z.array(z.object({
    id: z.int(),
    credit_id: z.string(),
    name: z.string(),
    original_name: z.string(),
    gender: z.int(),
    profile_path: NULLABLE_IMAGE_PATH_SCHEMA,
  })),
});

/** @internal */
export const TV_SERIES_DETAILS_WITH_EXTRAS_SCHEMA = z.object({
  ...TV_SERIES_SCHEMA.shape,
  external_ids: EXTERNAL_IDS_SCHEMA,
  images: IMAGES_SUB_REQUEST_SCHEMA,
  alternative_titles: ALTERNATIVE_TITLES_SCHEMA,
  translations: TRANSLATIONS_SCHEMA,
});
