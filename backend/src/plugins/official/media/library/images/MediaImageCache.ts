import { EagerSingleton } from '@sprax/node-framework';
import { CacheCodecs } from '../../../../../cache/CacheCodec.js';
import { FileContentCache } from '../../../../../cache/FileContentCache.js';
import { CacheServices } from '../../../../../cache/internal/CacheServices.js';

/** @internal */
@EagerSingleton()
export class MediaImageCache extends FileContentCache<Buffer> {
  constructor(services: CacheServices) {
    super(services, {
      namespace: 'apollo.media.library-images',
      version: 1,
      expiry: 'never',
      codec: CacheCodecs.bytes(),
    });
  }
}
