import { z } from 'zod';

export type TMDBMovieDetails = z.infer<typeof MOVIE_DETAILS_SCHEMA>;
export type TMDBTvSeriesDetails = z.infer<typeof TV_SERIES_DETAILS_SCHEMA>;
export type TMDBApiConfiguration = z.infer<typeof CONFIGURATION_RESPONSE_SCHEMA>;

const IMAGE_PATH_VALUE_SCHEMA = z.string().startsWith('/').nullable();

const PRODUCTION_COMPANY_SCHEMA = z.object({
  id: z.number(),
  name: z.string(),
  origin_country: z.string(),
  logo_path: IMAGE_PATH_VALUE_SCHEMA,
});

const MOVIE_AND_TV_SERIES_COMMON_DETAILS_SCHEMA = z.object({
  id: z.number(),

  /** In general, the adult flag is to be used for hardcore pornography. */
  adult: z.boolean(),
  homepage: z.string(),

  poster_path: IMAGE_PATH_VALUE_SCHEMA,
  backdrop_path: IMAGE_PATH_VALUE_SCHEMA,

  genres: z.array(z.object({
    id: z.number(),
    name: z.string(),
  })),

  popularity: z.number(),
  vote_count: z.number(),
  vote_average: z.number(),
});

const MOVIE_DETAILS_SCHEMA = MOVIE_AND_TV_SERIES_COMMON_DETAILS_SCHEMA.extend({
  imdb_id: z.string().nullable(),

  title: z.string(),
  original_title: z.string(),
  overview: z.string(),
  tagline: z.string(),

  status: z.enum(['Planned', 'In Production', 'Released', 'Post Production', 'Canceled', 'Rumored']),
  release_date: z.string().nullable(),

  /** This option typically applies to compilation videos, professional concerts, live theater and PPV events */
  video: z.boolean(),

  /** In minutes */
  runtime: z.number(),

  original_language: z.string(),
  origin_country: z.array(z.string()),

  spoken_languages: z.array(z.object({
    english_name: z.string(),
    iso_639_1: z.string(),
    name: z.string(),
  })),

  production_companies: z.array(PRODUCTION_COMPANY_SCHEMA),
  production_countries: z.array(z.object({
    iso_3166_1: z.string(),
    name: z.string(),
  })),
  budget: z.number(),
  revenue: z.number(),

  // belongs_to_collection: z.unknown(),
});

const TV_SERIES_DETAILS_SCHEMA = MOVIE_AND_TV_SERIES_COMMON_DETAILS_SCHEMA.extend({
  name: z.string(),
  original_name: z.string(),
  overview: z.string(),
  tagline: z.string(),

  status: z.enum(['Returning Series', 'Planned', 'Pilot', 'In Production', 'Ended', 'Canceled']),
  type: z.enum(['Documentary', 'News', 'Miniseries', 'Reality', 'Scripted', 'Talk Show', 'Video']),
  in_production: z.boolean(),
  number_of_episodes: z.number(),
  number_of_seasons: z.number(),
  first_air_date: z.string().nullable(),
  last_air_date: z.string().nullable(),

  episode_run_time: z.array(z.number()),
  seasons: z.array(z.object({
    id: z.number(),

    name: z.string(),
    overview: z.string(),

    season_number: z.number(),
    episode_count: z.number(),
    air_date: z.string().nullable(),

    poster_path: IMAGE_PATH_VALUE_SCHEMA,

    vote_average: z.number(),
  })),
  // last_episode_to_air: z.object().nullable(),
  // next_episode_to_air: z.object().nullable(),

  original_language: z.string(),
  origin_country: z.array(z.string()),
  languages: z.array(z.string()),
  spoken_languages: z.array(z.object({
    english_name: z.string(),
    iso_639_1: z.string(),
    name: z.string(),
  })),

  production_companies: z.array(PRODUCTION_COMPANY_SCHEMA),
  production_countries: z.array(z.object({
    iso_3166_1: z.string(),
    name: z.string(),
  })),
  // networks: z.array(z.object()),
  // created_by: z.array(z.unknown()),
});

export const EXTERNAL_IDS_SCHEMA = z.object({
  imdb_id: z.string().nullable(),
});
export const IMAGE_SCHEMA = z.object({
  file_path: IMAGE_PATH_VALUE_SCHEMA,

  width: z.number(),
  height: z.number(),
  aspect_ratio: z.number(),

  iso_3166_1: z.string().nonempty().nullable(),
  iso_639_1: z.string().length(2).nullable(),

  vote_average: z.number(),
  vote_count: z.number(),
});

export const FULL_MOVIE_DETAILS_RESPONSE_SCHEMA = MOVIE_DETAILS_SCHEMA.extend({
  external_ids: EXTERNAL_IDS_SCHEMA,
  images: z.object({
    backdrops: z.array(IMAGE_SCHEMA),
    logos: z.array(IMAGE_SCHEMA),
    posters: z.array(IMAGE_SCHEMA),
  }),
  alternative_titles: z.object({
    titles: z.array(z.object({
      iso_3166_1: z.string().nonempty(),
      title: z.string().nonempty(),
    })),
  }),
});
export const FULL_TV_SERIES_DETAILS_RESPONSE_SCHEMA = TV_SERIES_DETAILS_SCHEMA.extend({
  external_ids: EXTERNAL_IDS_SCHEMA,
  images: z.object({
    backdrops: z.array(IMAGE_SCHEMA),
    logos: z.array(IMAGE_SCHEMA),
    posters: z.array(IMAGE_SCHEMA),
  }),
  alternative_titles: z.object({
    results: z.array(z.object({
      iso_3166_1: z.string().nonempty(),
      title: z.string().nonempty(),
    })),
  }),
});

export const FIND_BY_EXTERNAL_ID_RESPONSE_SCHEMA = z.object({
  movie_results: z.array(z.object({
    id: z.number(),
    media_type: z.literal('movie'),

    title: z.string(),
    original_title: z.string(),
    overview: z.string(),

    adult: z.boolean(),
    video: z.boolean(),

    poster_path: IMAGE_PATH_VALUE_SCHEMA,
  })),
  tv_results: z.array(z.object({
    id: z.number(),
    media_type: z.literal('tv'),

    name: z.string(),
    original_name: z.string(),
    overview: z.string(),

    adult: z.boolean(),

    poster_path: IMAGE_PATH_VALUE_SCHEMA,
  })),
  person_results: z.array(z.object(z.unknown())),
  tv_episode_results: z.array(z.object(z.unknown())),
  tv_season_results: z.array(z.object(z.unknown())),
});

export const CONFIGURATION_RESPONSE_SCHEMA = z.object({
  change_keys: z.array(z.string().nonempty()),
  images: z.object({
    base_url: z.string().endsWith('/'),
    secure_base_url: z.string().endsWith('/'),
    backdrop_sizes: z.array(z.union([z.literal('original'), z.string()])).nonempty(),
    logo_sizes: z.array(z.union([z.literal('original'), z.string()])).nonempty(),
    poster_sizes: z.array(z.union([z.literal('original'), z.string()])).nonempty(),
    profile_sizes: z.array(z.union([z.literal('original'), z.string()])).nonempty(),
    still_sizes: z.array(z.union([z.literal('original'), z.string()])).nonempty(),
  }),
});
