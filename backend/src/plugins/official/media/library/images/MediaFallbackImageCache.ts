import { EagerSingleton } from '@sprax/node-framework';
import { TimeUnit } from '@spraxdev/node-commons/util';
import { CacheCodecs } from '../../../../../cache/CacheCodec.js';
import { CacheServices } from '../../../../../cache/internal/CacheServices.js';
import { UserCache } from '../../../../../cache/UserCache.js';

/** Images derived from the fallback images stored in the database, in the cache of the library owner */
@EagerSingleton()
export class MediaFallbackImageCache extends UserCache<Buffer> {
  constructor(services: CacheServices) {
    super(services, {
      namespace: 'apollo.media.fallback-images',
      version: 1,
      // Bounds how long an entry created from an image the hydrator was replacing at the same time stays around
      expiry: { freshMs: TimeUnit.DAYS.toMillis(30) },
      codec: CacheCodecs.bytes(),
    });
  }

  static toGroupKey(mediaId: bigint): string {
    return mediaId.toString();
  }

  static toEntryKey(mediaId: bigint, entryName: string): string {
    return `${MediaFallbackImageCache.toGroupKey(mediaId)}|${entryName}`;
  }
}
