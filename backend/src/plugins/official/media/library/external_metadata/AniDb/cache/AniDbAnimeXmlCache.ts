import { EagerSingleton } from '@sprax/node-framework';
import { TimeUnit } from '@spraxdev/node-commons/util';
import { AppCache } from '../../../../../../../cache/AppCache.js';
import { CacheCodecs } from '../../../../../../../cache/CacheCodec.js';
import type { CacheServices } from '../../../../../../../cache/internal/CacheServices.js';

/** @internal */
@EagerSingleton()
export class AniDbAnimeXmlCache extends AppCache<string | null> {
  constructor(services: CacheServices) {
    super(services, {
      namespace: 'apollo.media.anidb-anime-xml',
      version: 1,
      expiry: {
        freshMs: TimeUnit.DAYS.toMillis(3),
        staleMs: TimeUnit.DAYS.toMillis(90),
      },
      nullExpiry: { freshMs: TimeUnit.DAYS.toMillis(1) },
      codec: CacheCodecs.text(),
      contentType: 'application/xml',
    });
  }
}
