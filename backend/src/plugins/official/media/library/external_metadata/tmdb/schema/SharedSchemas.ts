import { z } from 'zod';

/** @internal */
export const NULLABLE_IMAGE_PATH_SCHEMA = z.string().startsWith('/').nullable();

/** @internal */
export const TITLE_SCHEMA = z.object({
  iso_3166_1: z.string(),
  title: z.string(),
  type: z.string().nullable(),
});

/** @internal */
export const COMPANY_SCHEMA = z.object({
  id: z.int(),
  name: z.string(),
  origin_country: z.string().nullable(),
  logo_path: NULLABLE_IMAGE_PATH_SCHEMA,
});

/** @internal */
export const SPOKEN_LANGUAGE_SCHEMA = z.object({
  iso_639_1: z.string(),
  name: z.string().nullable(),
  english_name: z.string(),
});

/** @internal */
export const PRODUCTION_COUNTRY_SCHEMA = z.object({
  iso_3166_1: z.string(),
  name: z.string(),
});

/** @internal */
export const GENRE_SCHEMA = z.object({
  id: z.int(),
  name: z.string(),
});

const IMAGE_DATA_SCHEMA = z.object({
  file_path: z.string().startsWith('/'),
  iso_3166_1: z.string().nullable(),
  iso_639_1: z.string().nullable(),
  aspect_ratio: z.number(),
  width: z.int(),
  height: z.int(),
  vote_count: z.int(),
  vote_average: z.number(),
});

/** @internal */
export const IMAGES_SUB_REQUEST_SCHEMA = z.object({
  backdrops: z.array(IMAGE_DATA_SCHEMA),
  logos: z.array(IMAGE_DATA_SCHEMA),
  posters: z.array(IMAGE_DATA_SCHEMA),
});
