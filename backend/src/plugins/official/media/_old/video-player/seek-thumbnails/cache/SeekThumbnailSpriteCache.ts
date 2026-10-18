import { EagerSingleton } from '@sprax/node-framework';
import { CacheCodecs } from '../../../../../../../cache/CacheCodec.js';
import { FileContentCache } from '../../../../../../../cache/FileContentCache.js';
import { CacheServices } from '../../../../../../../cache/internal/CacheServices.js';

/** @internal */
@EagerSingleton()
export class SeekThumbnailSpriteCache extends FileContentCache<Buffer> {
  constructor(services: CacheServices) {
    super(services, {
      namespace: 'apollo.media.seek-thumbnails.sprites',
      version: 1,
      expiry: 'never',
      codec: CacheCodecs.bytes(),
      contentType: 'image/jpeg',
    });
  }
}
