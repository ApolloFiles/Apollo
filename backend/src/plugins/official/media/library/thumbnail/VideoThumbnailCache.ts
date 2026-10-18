import { EagerSingleton } from '@sprax/node-framework';
import { CacheCodecs } from '../../../../../cache/CacheCodec.js';
import { FileContentCache } from '../../../../../cache/FileContentCache.js';
import { CacheServices } from '../../../../../cache/internal/CacheServices.js';

/** @internal */
@EagerSingleton()
export class VideoThumbnailCache extends FileContentCache<Buffer> {
  constructor(services: CacheServices) {
    super(services, {
      namespace: 'apollo.media.video-thumbnails',
      version: 1,
      expiry: 'never',
      codec: CacheCodecs.bytes(),
    });
  }
}
