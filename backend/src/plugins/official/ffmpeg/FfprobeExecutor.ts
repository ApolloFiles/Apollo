import { singleton } from 'tsyringe';
import { z } from 'zod';
import BufferedChildProcess from '../../builtin/child_process/BufferedChildProcess.js';
import { PROBE_RESULT_FULL_SCHEMA, PROBE_RESULT_SCHEMA } from './FfprobeValidationSchemas.js';

export type ProbeResult = z.infer<typeof PROBE_RESULT_SCHEMA>;
export type ExtendedProbeResult = z.infer<typeof PROBE_RESULT_FULL_SCHEMA>;

@singleton()
export default class FfprobeExecutor {
  async probe(filePath: string, extendedAnalysis?: false): Promise<ProbeResult>;
  async probe(filePath: string, extendedAnalysis: true): Promise<ExtendedProbeResult>;
  async probe(filePath: string, extendedAnalysis = false): Promise<ProbeResult | ExtendedProbeResult> {
    const processArgs = ['-print_format', 'json=compact=1', '-show_format'];
    if (extendedAnalysis) {
      processArgs.push('-show_streams', '-show_chapters');
    }
    processArgs.push(filePath);

    const childProcess = await BufferedChildProcess.spawn('ffprobe', processArgs);
    if (childProcess.exitCode !== 0) {
      throw new Error(`ffprobe exited with code ${childProcess.exitCode}: {stderr=${childProcess.stderr.toString('utf-8')}, stdout=${childProcess.stdout.toString('utf-8')}}`);
    }

    let stdOutJson: unknown;
    try {
      stdOutJson = JSON.parse(childProcess.stdout.toString('utf-8'));
    } catch (err) {
      throw new Error(`Failed to parse ffprobe output as JSON: {stderr=${childProcess.stderr.toString('utf-8')}, stdout=${childProcess.stdout.toString('utf-8')}}`, { cause: err });
    }

    let probeResult;
    if (extendedAnalysis) {
      probeResult = PROBE_RESULT_FULL_SCHEMA.parse(stdOutJson);
    } else {
      probeResult = PROBE_RESULT_SCHEMA.parse(stdOutJson);
    }

    this.logWarningsForUnexpectedKeys(filePath, probeResult, stdOutJson);
    return probeResult;
  }

  private logWarningsForUnexpectedKeys(filePath: string, parsed: unknown, raw: unknown, path: string = ''): void {
    if (typeof parsed !== 'object' || parsed == null) {
      return;
    }

    const rawObj = raw as Record<string, unknown>;
    const parsedObj = parsed as Record<string, unknown>;

    for (const key in rawObj) {
      if (Object.prototype.hasOwnProperty.call(rawObj, key)) {
        const currentPath = `${path}.${key}`;

        if (!Object.prototype.hasOwnProperty.call(parsedObj, key)) {
          console.warn(`Unexpected key in ffprobe output: {path=${currentPath}, value=${JSON.stringify(rawObj[key])}, file=${filePath}}`);
        } else {
          this.logWarningsForUnexpectedKeys(filePath, parsedObj[key], rawObj[key], currentPath);
        }
      }
    }
  }
}
