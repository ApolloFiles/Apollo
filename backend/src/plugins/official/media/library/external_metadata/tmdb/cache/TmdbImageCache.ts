import { EagerSingleton } from '@sprax/node-framework';
import { TimeUnit } from '@spraxdev/node-commons/util';
import { AppCache } from '../../../../../../../cache/AppCache.js';
import { CacheCodecs } from '../../../../../../../cache/CacheCodec.js';
import { CacheServices } from '../../../../../../../cache/internal/CacheServices.js';

/** @internal */
@EagerSingleton()
export class TmdbImageCache extends AppCache<Buffer | null> {
  constructor(services: CacheServices) {
    super(services, {
      namespace: 'apollo.media.tmdb-images',
      version: 1,
      expiry: {
        // TheMovieDB only allows caching for a maximum of 6 months (https://www.themoviedb.org/api-terms-of-use)
        freshMs: TimeUnit.DAYS.toMillis(6 * 30),
      },
      nullExpiry: { freshMs: TimeUnit.DAYS.toMillis(1) },
      codec: CacheCodecs.bytes(),
    });
  }
}
