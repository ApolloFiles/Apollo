import { z } from 'zod';
import { BASE_ITEM_SCHEMA } from '../ItemSchemas.js';

/** @internal */
export const ITEM_FILE_SCHEMA = z.object({
  id: z.string()
    .describe('Equal to the item id in v1; a later version may give files ids of their own'),
  fileName: z.string()
    .describe('The name of the file without its directory'),
  durationSeconds: z.number().int(),
})
  .meta({ id: 'ItemFile' });

/** @internal */
export const ITEM_DETAIL_SCHEMA = BASE_ITEM_SCHEMA.extend({
  files: z.array(ITEM_FILE_SCHEMA)
    .describe('Exactly one entry in v1. Files that share one timeline are versions of the same item; a different cut is a sibling item'),
})
  .meta({ id: 'ItemDetail' });

/** @internal */
export type ItemDetailDto = z.infer<typeof ITEM_DETAIL_SCHEMA>;
