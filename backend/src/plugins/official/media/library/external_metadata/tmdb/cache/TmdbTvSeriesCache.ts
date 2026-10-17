import { EagerSingleton } from '@sprax/node-framework';
import { TimeUnit } from '@spraxdev/node-commons/util';
import { AppCache } from '../../../../../../../cache/AppCache.js';
import { CacheCodecs } from '../../../../../../../cache/CacheCodec.js';
import { CacheServices } from '../../../../../../../cache/internal/CacheServices.js';
import { TV_SERIES_DETAILS_WITH_EXTRAS_SCHEMA, type TvSeriesDetailsWithExtras } from '../schema/TvSeriesSchema.js';

/** @internal */
@EagerSingleton()
export class TmdbTvSeriesCache extends AppCache<TvSeriesDetailsWithExtras | null> {
  constructor(services: CacheServices) {
    super(services, {
      namespace: 'apollo.media.tmdb-tv-series',
      version: 1,
      expiry: {
        freshMs: TimeUnit.DAYS.toMillis(3),
        staleMs: TimeUnit.DAYS.toMillis(90),
      },
      nullExpiry: { freshMs: TimeUnit.DAYS.toMillis(1) },
      codec: CacheCodecs.json(TV_SERIES_DETAILS_WITH_EXTRAS_SCHEMA),
    });
  }
}
