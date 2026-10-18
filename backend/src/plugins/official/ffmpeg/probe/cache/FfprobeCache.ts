import { EagerSingleton } from '@sprax/node-framework';
import { CacheCodecs } from '../../../../../cache/CacheCodec.js';
import { FileContentCache } from '../../../../../cache/FileContentCache.js';
import { CacheServices } from '../../../../../cache/internal/CacheServices.js';
import { RAW_PROBE_RESULT_SCHEMA, type RawProbeResult } from '../FfprobeSchemas.js';

/** @internal */
@EagerSingleton()
export class FfprobeCache extends FileContentCache<RawProbeResult> {
  constructor(services: CacheServices) {
    super(services, {
      namespace: 'apollo.ffmpeg.probe',
      version: 1,
      expiry: 'never',
      codec: CacheCodecs.json(RAW_PROBE_RESULT_SCHEMA),
    });
  }
}
