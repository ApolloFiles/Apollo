import { EagerSingleton } from '@sprax/node-framework';
import { TimeUnit } from '@spraxdev/node-commons/util';
import { AppCache } from '../../../../../../../cache/AppCache.js';
import { CacheCodecs } from '../../../../../../../cache/CacheCodec.js';
import type { CacheServices } from '../../../../../../../cache/internal/CacheServices.js';

/** @internal */
@EagerSingleton()
export class AniDbImageCache extends AppCache<Buffer> {
  constructor(services: CacheServices) {
    super(services, {
      namespace: 'apollo.media.anidb-images',
      version: 1,
      expiry: { freshMs: TimeUnit.DAYS.toMillis(365) },
      codec: CacheCodecs.bytes(),
    });
  }
}
