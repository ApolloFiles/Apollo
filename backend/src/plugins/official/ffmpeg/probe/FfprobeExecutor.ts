import { singleton } from 'tsyringe';
import BufferedChildProcess from '../../../builtin/child_process/BufferedChildProcess.js';
import { RAW_PROBE_RESULT_SCHEMA, type RawProbeResult } from './FfprobeSchemas.js';

/** @internal */
@singleton()
export class FfprobeExecutor {
  private static readonly BASE_ARGS = ['-print_format', 'json=compact=1', '-show_format'];

  probeFormat(filePath: string): Promise<RawProbeResult> {
    return this.executeFfprobe([...FfprobeExecutor.BASE_ARGS, filePath]);
  }

  probeFull(filePath: string): Promise<RawProbeResult> {
    return this.executeFfprobe([
      ...FfprobeExecutor.BASE_ARGS,
      '-show_streams',
      '-show_chapters',
      filePath,
    ]);
  }

  private async executeFfprobe(processArgs: string[]): Promise<RawProbeResult> {
    const childProcess = await BufferedChildProcess.spawn('ffprobe', processArgs);
    const stdoutText = childProcess.stdout.toString('utf-8');

    if (childProcess.exitCode !== 0) {
      throw new Error(`ffprobe exited with code ${childProcess.exitCode}: {stderr=${childProcess.stderr.toString('utf-8')}, stdout=${stdoutText}}`);
    }

    try {
      return RAW_PROBE_RESULT_SCHEMA.parse(JSON.parse(stdoutText));
    } catch (err) {
      throw new Error(`Failed to parse ffprobe output as a JSON object: {stderr=${childProcess.stderr.toString('utf-8')}, stdout=${stdoutText}}`, { cause: err });
    }
  }
}
