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
export type MovieDetailsWithExtras = z.infer<typeof MOVIE_DETAILS_WITH_EXTRAS_SCHEMA>;

const EXTERNAL_IDS_SCHEMA = z.object({
  imdb_id: z.string().nullable(),
  wikidata_id: z.string().nullable(),
  facebook_id: z.string().nullable(),
  instagram_id: z.string().nullable(),
  twitter_id: z.string().nullable(),
});

const ALTERNATIVE_TITLE_SCHEMA = z.object({
  titles: z.array(TITLE_SCHEMA),
});

const TRANSLATIONS_SCHEMA = z.object({
  translations: z.array(z.object({
    iso_3166_1: z.string(),
    iso_639_1: z.string(),
    name: z.string().nullable(),
    english_name: z.string(),
    data: z.object({
      title: z.string().nullable(),
      tagline: z.string().nullable(),
      overview: z.string().nullable(),
      homepage: z.string().nullable(),
      /** In minutes */
      runtime: z.int(),
    }),
  })),
});

const MOVIE_DETAILS_SCHEMA = z.object({
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

  imdb_id: z.string().nullable(),

  title: z.string(),
  original_title: z.string(),
  overview: z.string().nullable(),
  tagline: z.string().nullable(),

  status: z.string(),
  release_date: z.string().nullable(),

  /** This option typically applies to compilation videos, professional concerts, live theater and PPV events */
  video: z.boolean(),

  /** In minutes */
  runtime: z.int(),

  original_language: z.string(),
  origin_country: z.array(z.string()),

  spoken_languages: z.array(SPOKEN_LANGUAGE_SCHEMA),

  production_companies: z.array(COMPANY_SCHEMA),
  production_countries: z.array(PRODUCTION_COUNTRY_SCHEMA),
  budget: z.int(),
  revenue: z.int(),

  belongs_to_collection: z.object({
    id: z.int(),
    name: z.string(),
    poster_path: NULLABLE_IMAGE_PATH_SCHEMA,
    backdrop_path: NULLABLE_IMAGE_PATH_SCHEMA,
  }).nullable(),
});

/** @internal */
export const MOVIE_DETAILS_WITH_EXTRAS_SCHEMA = z.object({
  ...MOVIE_DETAILS_SCHEMA.shape,
  external_ids: EXTERNAL_IDS_SCHEMA,
  images: IMAGES_SUB_REQUEST_SCHEMA,
  alternative_titles: ALTERNATIVE_TITLE_SCHEMA,
  translations: TRANSLATIONS_SCHEMA,
});
