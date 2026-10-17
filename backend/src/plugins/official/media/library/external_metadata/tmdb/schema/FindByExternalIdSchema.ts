import { z } from 'zod';
import { NULLABLE_IMAGE_PATH_SCHEMA } from './SharedSchemas.js';

/** @internal */
export const FIND_BY_EXTERNAL_ID_SCHEMA = z.object({
  movie_results: z.array(z.object({
    id: z.int(),
    original_title: z.string(),
    original_language: z.string(),
    release_date: z.string().nullable(),

    adult: z.boolean(),
    softcore: z.boolean(),
    video: z.boolean(),
    title: z.string(),
    overview: z.string().nullable(),

    backdrop_path: NULLABLE_IMAGE_PATH_SCHEMA,
    poster_path: NULLABLE_IMAGE_PATH_SCHEMA,

    media_type: z.string(),
    genre_ids: z.array(z.int()),

    popularity: z.number(),
    vote_average: z.number(),
    vote_count: z.int(),
  })),

  tv_results: z.array(z.object({
    id: z.int(),
    original_name: z.string(),
    original_language: z.string(),
    first_air_date: z.string().nullable(),

    adult: z.boolean(),
    softcore: z.boolean(),
    name: z.string(),
    overview: z.string().nullable(),

    backdrop_path: NULLABLE_IMAGE_PATH_SCHEMA,
    poster_path: NULLABLE_IMAGE_PATH_SCHEMA,

    media_type: z.string(),
    genre_ids: z.array(z.int()),
    origin_country: z.array(z.string()),

    popularity: z.number(),
    vote_average: z.number(),
    vote_count: z.int(),
  })),

  person_results: z.array(z.unknown()),
  tv_episode_results: z.array(z.unknown()),
  tv_season_results: z.array(z.unknown()),
});
