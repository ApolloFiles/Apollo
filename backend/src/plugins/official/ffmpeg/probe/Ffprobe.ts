import { singleton } from 'tsyringe';
import { FfprobeExecutor } from './FfprobeExecutor.js';
import { FfprobeResultParser } from './FfprobeResultParser.js';
import type { FormatProbeResult, FullProbeResult } from './FfprobeSchemas.js';

@singleton()
export class Ffprobe {
  constructor(
    private readonly executor: FfprobeExecutor,
    private readonly resultParser: FfprobeResultParser,
  ) {
  }

  async probeFormat(filePath: string): Promise<FormatProbeResult> {
    const raw = await this.executor.probeFormat(filePath);
    const parsed = this.resultParser.parseFormat(raw);
    this.resultParser.logUnknownKeys(filePath, raw, parsed);
    return parsed;
  }

  async probeFull(filePath: string): Promise<FullProbeResult> {
    const raw = await this.executor.probeFull(filePath);
    const parsed = this.resultParser.parseFull(raw);
    this.resultParser.logUnknownKeys(filePath, raw, parsed);
    return parsed;
  }
}
