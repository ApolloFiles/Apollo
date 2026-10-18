import { EagerSingleton } from '@sprax/node-framework';
import { TimeUnit } from '@spraxdev/node-commons/util';
import { AppCache } from '../../../../../cache/AppCache.js';
import { CacheCodecs } from '../../../../../cache/CacheCodec.js';
import { CacheServices } from '../../../../../cache/internal/CacheServices.js';

/** @internal */
@EagerSingleton()
export class GeneratedMediaPosterCache extends AppCache<Buffer> {
  constructor(services: CacheServices) {
    super(services, {
      namespace: 'apollo.media.generated-posters',
      version: 1,
      expiry: { freshMs: TimeUnit.DAYS.toMillis(30) },
      codec: CacheCodecs.bytes(),
    });
  }
}
