import ChildProcess from 'node:child_process';
import EventEmitter from 'node:events';

export type FfmpegMetrics = { [key: string]: string | number } & {
  frame?: number;
  fps?: number;
  speed?: number;
  time?: string;
}

/**
 * @deprecated
 */
export default class FfmpegProcess extends EventEmitter {
  private static readonly EXECUTABLE = 'ffmpeg';  // TODO: Make this configurable
  private static readonly MAX_STDERR_TAIL_LINES = 20;
  private static readonly MAX_BUFFERED_STDERR_LENGTH = 16384;

  private readonly childProcess: ChildProcess.ChildProcess;
  /** The most recent stderr output, excluding the periodic progress/metrics lines. */
  private stderrTail = '';

  constructor(args: string[], options: ChildProcess.SpawnOptions = { stdio: 'ignore' }) {
    super();
    this.childProcess = ChildProcess.spawn(FfmpegProcess.EXECUTABLE, args, options);

    let hwDecoding = 'none/unknown';
    this.childProcess.stderr?.on('data', (data) => {
      const dataAsString = data.toString();
      if (dataAsString.startsWith('frame=') || dataAsString.startsWith('size=')) {
        this.emit('metrics', {
          hwDecoding,
          ...FfmpegProcess.parseMetrics(dataAsString),
        });

        return;
      }

      if (dataAsString.startsWith('Using auto hwaccel type ')) {
        hwDecoding = dataAsString.split(' ')[4];
      }

      // Kept raw (only length-capped) – trimming to whole lines here would drop the newline a chunk ends on
      this.stderrTail = (this.stderrTail + dataAsString).slice(-FfmpegProcess.MAX_BUFFERED_STDERR_LENGTH);
    });
  }

  /**
   * The last few stderr lines of the process (progress lines excluded), or an empty string if stderr is not piped.
   *
   * Without this, a failing FFmpeg process is invisible to the caller: its exit code has no listener and everything
   * it printed is discarded, so the only symptom is a missing output file. Only the tail is kept, because the reason
   * a process failed is always at the end – the start is the version banner and a dump of the input file's metadata.
   */
  getStderrTail(): string {
    return this.stderrTail
      .split(/[\r\n]+/)
      .filter((line) => line.trim() !== '' && !line.startsWith('frame=') && !line.startsWith('size='))
      .slice(-FfmpegProcess.MAX_STDERR_TAIL_LINES)
      .join('\n');
  }

  /** Whether the process already exited (or was killed). */
  hasExited(): boolean {
    return this.childProcess.exitCode != null || this.childProcess.signalCode != null;
  }

  /** The exit code of the process, or `null` if it is still running or was terminated by a signal. */
  getExitCode(): number | null {
    return this.childProcess.exitCode;
  }

  on(event: 'metrics', listener: (metrics: FfmpegMetrics) => void): this;
  on(event: 'metrics', listener: (...args: any[]) => void): this {
    return super.on(event, listener);
  }

  emit(event: 'metrics', metrics: FfmpegMetrics): boolean;
  emit(event: 'metrics', ...args: any[]): boolean {
    return super.emit(event, ...args);
  }

  waitForSuccessExit(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.childProcess.on('error', (err) => reject(err));
      this.childProcess.on('exit', (code) => {
        if (code !== 0) {
          reject(new Error(`FFmpeg process exited with code ${code}`));
          return;
        }
        resolve();
      });
    });
  }

  waitForExit(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.childProcess.on('error', (err) => reject(err));
      this.childProcess.on('exit', (code) => {
        if (typeof code != 'number') {
          reject(new Error(`FFmpeg process exited with code ${code}`));
          return;
        }

        resolve(code);
      });
    });
  }

  getProcess(): ChildProcess.ChildProcess {
    return this.childProcess;
  }

  async shutdown(timeout = 5000): Promise<void> {
    if (this.childProcess.killed || this.childProcess.exitCode !== null) {
      return;
    }

    return new Promise((resolve, reject) => {
      this.childProcess.on('exit', () => resolve());

      this.childProcess.kill('SIGKILL');
      setTimeout(() => this.terminate().then(resolve).catch(reject), timeout);
    });
  }

  async terminate(): Promise<void> {
    if (this.childProcess.killed || this.childProcess.exitCode !== null) {
      return;
    }

    this.childProcess.kill('SIGKILL');
    return new Promise((resolve) => this.childProcess.on('exit', () => resolve()));
  }

  private static parseMetrics(dataAsString: string): FfmpegMetrics {
    const metrics: FfmpegMetrics = {};

    const pattern = /(\w+)=(\S+)/g;

    let match;
    while (match = pattern.exec(dataAsString)) {
      const key = match[1];
      const value = match[2];

      if (key === 'frame' || key === 'fps' || key === 'dup' || key === 'drop') {
        metrics[key] = parseInt(value, 10);
      } else if (key === 'speed' || key === 'q') {
        if (value === 'N/A') {
          continue;
        }
        metrics[key] = parseFloat(value);
      } else {
        metrics[key] = value;
      }
    }

    return metrics;
  }
}
