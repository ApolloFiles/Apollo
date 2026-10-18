import { singleton } from 'tsyringe';
import type LocalFile from '../../../../files/local/LocalFile.js';
import { FfprobeCache } from './cache/FfprobeCache.js';
import { FfprobeExecutor } from './FfprobeExecutor.js';
import { FfprobeResultParser } from './FfprobeResultParser.js';
import type { FormatProbeResult, FullProbeResult, RawProbeResult } from './FfprobeSchemas.js';

@singleton()
export class CachedFfprobe {
  constructor(
    private readonly executor: FfprobeExecutor,
    private readonly resultParser: FfprobeResultParser,
    private readonly cache: FfprobeCache,
  ) {
  }

  async probeFormat(file: LocalFile): Promise<FormatProbeResult> {
    const cacheEntry = await this.cache.getOrCreate(file, 'format', () => this.probeFormatForCache(file.getAbsolutePathOnHost()));
    return this.resultParser.parseFormat(await cacheEntry.value());
  }

  async probeFull(file: LocalFile): Promise<FullProbeResult> {
    const cacheEntry = await this.cache.getOrCreate(file, 'full', () => this.probeFullForCache(file.getAbsolutePathOnHost()));
    return this.resultParser.parseFull(await cacheEntry.value());
  }

  /** Parses before caching, so output the schema rejects is never cached */
  private async probeFormatForCache(filePath: string): Promise<RawProbeResult> {
    const raw = await this.executor.probeFormat(filePath);
    this.resultParser.logUnknownKeys(filePath, raw, this.resultParser.parseFormat(raw));
    return raw;
  }

  /** Parses before caching, so output the schema rejects is never cached */
  private async probeFullForCache(filePath: string): Promise<RawProbeResult> {
    const raw = await this.executor.probeFull(filePath);
    this.resultParser.logUnknownKeys(filePath, raw, this.resultParser.parseFull(raw));
    return raw;
  }
}
