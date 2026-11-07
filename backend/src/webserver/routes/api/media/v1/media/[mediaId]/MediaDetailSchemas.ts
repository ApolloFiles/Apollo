import { z } from 'zod';
import { BASE_ITEM_SCHEMA } from '../../items/ItemSchemas.js';
import { BASE_MEDIA_SCHEMA } from '../MediaSchemas.js';

/** @internal */
export const SEASON_SCHEMA = z.object({
  seasonNumber: z.number().int()
    .describe('The number the scanner found; season 0 carries no special meaning yet'),
  items: z.array(BASE_ITEM_SCHEMA)
    .describe('In display order'),
})
  .meta({ id: 'Season' });

/** @internal */
export const MEDIA_DETAIL_SCHEMA = BASE_MEDIA_SCHEMA.extend({
  synopsis: z.string().nullable(),
  externalIds: z.object({
    tmdb: z.string().optional(),
    imdb: z.string().optional(),
    tvdb: z.string().optional(),
  })
    .describe('Only known ids are present; further sources are additive'),

  me: z.object({
    nextItemToWatch: BASE_ITEM_SCHEMA
      .nullable()
      .describe('What to play next: the item in progress, the one after the last finished item, or the first one. Null when everything is watched'),
  })
    .describe('Everything that depends on the requesting user'),

  items: z.array(BASE_ITEM_SCHEMA)
    .describe('In display order. Movies: the movie item(s). Shows: the items without season and episode numbers'),
  seasons: z.array(SEASON_SCHEMA)
    .optional()
    .describe('Shows only, ascending by season number'),
})
  .meta({ id: 'MediaDetail' });

/** @internal */
export type MediaDetailDto = z.infer<typeof MEDIA_DETAIL_SCHEMA>;
