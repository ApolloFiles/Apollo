import { z } from 'zod';
import { API_TIMESTAMP_SCHEMA } from '../../../../../public-api/ApiTimestampSchema.js';

/** @internal */
export const BASE_ITEM_SCHEMA = z.object({
  id: z.string(),
  mediaId: z.string(),
  kind: z.enum(['movie', 'episode'])
    .describe('[Open enum] Follows the type of the media, not the numbering of the item'),
  title: z.string(),
  synopsis: z.string().nullable(),

  seasonNumber: z.number().int()
    .optional()
    .describe('Absent when the item is not numbered'),
  episodeNumber: z.number()
    .optional()
    .describe('Numeric, usually an integer, may be fractional. Absent when the item is not numbered'),

  durationSeconds: z.number().int(),

  me: z.object({
    watchProgress: z.object({
      positionSeconds: z.number().int(),
      updatedAt: API_TIMESTAMP_SCHEMA,
    })
      .nullable()
      .describe('Null when never started'),
  })
    .describe('Everything that depends on the requesting user'),
})
  .meta({ id: 'BaseItem' });

/** @internal */
export type BaseItemDto = z.infer<typeof BASE_ITEM_SCHEMA>;
