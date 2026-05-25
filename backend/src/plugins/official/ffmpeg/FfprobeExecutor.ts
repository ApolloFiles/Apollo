import { singleton } from 'tsyringe';
import { z } from 'zod';
import BufferedChildProcess from '../../builtin/child_process/BufferedChildProcess.js';
import { PROBE_RESULT_FULL_SCHEMA, PROBE_RESULT_SCHEMA } from './FfprobeValidationSchemas.js';

export type ProbeResult = z.infer<typeof PROBE_RESULT_SCHEMA>;
export type ExtendedProbeResult = z.infer<typeof PROBE_RESULT_FULL_SCHEMA>;

@singleton()
export default class FfprobeExecutor {
  private readonly BASE_CMD_ARGS = ['-print_format', 'json=compact=1', '-show_format'];

  async probeFormat(filePath: string): Promise<ProbeResult> {
    const ffprobeJson = await this.runFfprobe([...this.BASE_CMD_ARGS, filePath]);
    const probeResult = PROBE_RESULT_SCHEMA.parse(ffprobeJson);

    this.logWarningsForUnexpectedKeys(filePath, probeResult, ffprobeJson);
    return probeResult;
  }

  async probeFull(filePath: string): Promise<ExtendedProbeResult> {
    const processArgs = [
      ...this.BASE_CMD_ARGS,
      '-show_streams',
      '-show_chapters',
      filePath,
    ];
    const ffprobeJson = await this.runFfprobe(processArgs);
    const probeResult = PROBE_RESULT_FULL_SCHEMA.parse(ffprobeJson);

    this.logWarningsForUnexpectedKeys(filePath, probeResult, ffprobeJson);
    return probeResult;
  }

  private async runFfprobe(processArgs: string[]): Promise<unknown> {
    const childProcess = await BufferedChildProcess.spawn('ffprobe', processArgs);
    const stdoutText = childProcess.stdout.toString('utf-8');

    if (childProcess.exitCode !== 0) {
      throw new Error(`ffprobe exited with code ${childProcess.exitCode}: {stderr=${childProcess.stderr.toString('utf-8')}, stdout=${stdoutText}}`);
    }

    try {
      return JSON.parse(stdoutText);
    } catch (err) {
      throw new Error(`Failed to parse ffprobe output as JSON: {stderr=${childProcess.stderr.toString('utf-8')}, stdout=${stdoutText}}`, { cause: err });
    }
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
