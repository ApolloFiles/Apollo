import { EagerSingleton } from '@sprax/node-framework';
import { z } from 'zod';
import { CacheCodecs } from '../../../../../../../cache/CacheCodec.js';
import { FileContentCache } from '../../../../../../../cache/FileContentCache.js';
import { CacheServices } from '../../../../../../../cache/internal/CacheServices.js';

const SEEK_THUMBNAIL_INDEX_SCHEMA = z.object({
  thumbnail: z.object({
    count: z.number().int().positive(),
    size: z.tuple([z.number().int().positive(), z.number().int().positive()]),
  }),
  frameTimes: z.array(z.number()),
});

export type SeekThumbnailIndex = z.infer<typeof SEEK_THUMBNAIL_INDEX_SCHEMA>;

/** @internal */
@EagerSingleton()
export class SeekThumbnailIndexCache extends FileContentCache<SeekThumbnailIndex> {
  constructor(services: CacheServices) {
    super(services, {
      namespace: 'apollo.media.seek-thumbnails.index',
      version: 1,
      expiry: 'never',
      codec: CacheCodecs.json(SEEK_THUMBNAIL_INDEX_SCHEMA),
    });
  }
}
