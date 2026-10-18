import { singleton } from 'tsyringe';
import { UnknownKeyFinder } from '../../../../utils/UnknownKeyFinder.js';
import {
  FORMAT_PROBE_RESULT_SCHEMA,
  type FormatProbeResult,
  FULL_PROBE_RESULT_SCHEMA,
  type FullProbeResult,
  type RawProbeResult,
} from './FfprobeSchemas.js';

/** @internal */
@singleton()
export class FfprobeResultParser {
  parseFormat(raw: RawProbeResult): FormatProbeResult {
    return FORMAT_PROBE_RESULT_SCHEMA.parse(raw);
  }

  parseFull(raw: RawProbeResult): FullProbeResult {
    return FULL_PROBE_RESULT_SCHEMA.parse(raw);
  }

  logUnknownKeys(filePath: string, raw: RawProbeResult, parsed: FormatProbeResult): void {
    const unknownKeys = UnknownKeyFinder.find(raw, parsed);
    if (unknownKeys.length > 0) {
      console.warn(`[ffprobe] Output for ${filePath} has ${unknownKeys.length} keys the schema does not know yet: ${unknownKeys.join(', ')}`);
    }
  }
}
