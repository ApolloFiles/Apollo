import { EagerSingleton } from '@sprax/node-framework';
import { TimeUnit } from '@spraxdev/node-commons/util';
import { AppCache } from '../../../../../../../cache/AppCache.js';
import { CacheCodecs } from '../../../../../../../cache/CacheCodec.js';
import { CacheServices } from '../../../../../../../cache/internal/CacheServices.js';
import { MOVIE_DETAILS_WITH_EXTRAS_SCHEMA, type MovieDetailsWithExtras } from '../schema/MovieSchema.js';

/** @internal */
@EagerSingleton()
export class TmdbMovieCache extends AppCache<MovieDetailsWithExtras | null> {
  constructor(services: CacheServices) {
    super(services, {
      namespace: 'apollo.media.tmdb-movies',
      version: 1,
      expiry: {
        freshMs: TimeUnit.DAYS.toMillis(3),
        staleMs: TimeUnit.DAYS.toMillis(90),
      },
      nullExpiry: { freshMs: TimeUnit.DAYS.toMillis(1) },
      codec: CacheCodecs.json(MOVIE_DETAILS_WITH_EXTRAS_SCHEMA),
    });
  }
}
