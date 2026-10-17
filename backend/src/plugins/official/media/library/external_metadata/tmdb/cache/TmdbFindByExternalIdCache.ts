import { EagerSingleton } from '@sprax/node-framework';
import { TimeUnit } from '@spraxdev/node-commons/util';
import { z } from 'zod';
import { AppCache } from '../../../../../../../cache/AppCache.js';
import { CacheCodecs } from '../../../../../../../cache/CacheCodec.js';
import { CacheServices } from '../../../../../../../cache/internal/CacheServices.js';

const FIND_BY_EXTERNAL_ID_DATA_SCHEMA = z.object({
  id: z.int(),
  type: z.enum(['movie', 'tv']),
});

/** @internal */
export type FindByExternalIdData = z.infer<typeof FIND_BY_EXTERNAL_ID_DATA_SCHEMA>;

/** @internal */
@EagerSingleton()
export class TmdbFindByExternalIdCache extends AppCache<FindByExternalIdData | null> {
  constructor(services: CacheServices) {
    super(services, {
      namespace: 'apollo.media.tmdb-find-by-external-id',
      version: 1,
      expiry: {
        freshMs: TimeUnit.DAYS.toMillis(14),
        staleMs: TimeUnit.DAYS.toMillis(90),
      },
      nullExpiry: { freshMs: TimeUnit.DAYS.toMillis(1) },
      codec: CacheCodecs.json(FIND_BY_EXTERNAL_ID_DATA_SCHEMA),
    });
  }
}
