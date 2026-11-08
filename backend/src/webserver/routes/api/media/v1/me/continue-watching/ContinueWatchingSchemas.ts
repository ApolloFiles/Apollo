import { z } from 'zod';
import { BASE_ITEM_SCHEMA } from '../../items/ItemSchemas.js';
import { BASE_MEDIA_SCHEMA } from '../../media/MediaSchemas.js';

/** @internal */
export const CONTINUE_WATCHING_ENTRY_SCHEMA = z.object({
  media: BASE_MEDIA_SCHEMA,
  item: BASE_ITEM_SCHEMA.describe('The item to play next'),
})
  .meta({ id: 'ContinueWatchingEntry' });

/** @internal */
export type ContinueWatchingEntryDto = z.infer<typeof CONTINUE_WATCHING_ENTRY_SCHEMA>;

/** @internal */
export const CONTINUE_WATCHING_LIST_SCHEMA = z.object({
  items: z.array(CONTINUE_WATCHING_ENTRY_SCHEMA),
})
  .meta({ id: 'ContinueWatchingList' });

/** @internal */
export type ContinueWatchingListDto = z.infer<typeof CONTINUE_WATCHING_LIST_SCHEMA>;
