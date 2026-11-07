import { z } from 'zod';

/** @internal */
export const BASE_MEDIA_SCHEMA = z.object({
  id: z.string(),
  libraryId: z.string(),
  type: z.enum(['movie', 'show'])
    .describe('[Open enum]'),
  title: z.string(),
  year: z.number().int().nullable(),
})
  .meta({ id: 'BaseMedia' });

/** @internal */
export type BaseMediaDto = z.infer<typeof BASE_MEDIA_SCHEMA>;
