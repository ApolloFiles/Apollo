import { z } from 'zod';

/** @internal */
export const MEDIA_LIBRARY_SCHEMA = z.object({
  id: z.string(),
  name: z.string(),

  me: z.object({
    role: z.enum(['owner', 'shared'])
      .describe('The requesting user\'s relationship to the library [Open enum]'),
    preferences: z.object({
      hiddenFromOverview: z.boolean(),
      hiddenFromSidebar: z.boolean(),
    })
      .describe('The requesting user\'s own view preferences'),
  })
    .describe('Everything that depends on the requesting user. The API never applies these; clients decide what to show.'),
})
  .meta({ id: 'MediaLibrary' });

/** @internal */
export type MediaLibraryDto = z.infer<typeof MEDIA_LIBRARY_SCHEMA>;
