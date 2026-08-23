import type ChildProcess from 'node:child_process';
import EventEmitter from 'node:events';
import Readline from 'node:readline';
import Stream from 'node:stream';
import FfmpegLogBuffer from './FfmpegLogBuffer.js';
import FfmpegLogLineParser, { type FfmpegLogLine } from './FfmpegLogLineParser.js';
import FfmpegProgressParser, { type FfmpegProgress } from './FfmpegProgressParser.js';

export type FfmpegExitResult = {
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly runtimeInMillis: number;
}

export type FfmpegRunStats = {
  readonly runtimeInMillis: number;
  readonly peakFps: number | null;
  readonly lastProgress: FfmpegProgress | null;
}

export type FfmpegHandleOptions = {
  readonly captureFullLog: boolean;
  readonly captureStdout: boolean;
}

type FfmpegHandleEvents = {
  progress: [FfmpegProgress];
  log: [FfmpegLogLine];
  exit: [FfmpegExitResult];
}

/**
 * A running FFmpeg process.
 *
 * Every piped file descriptor is drained by this class itself: a pipe nobody reads fills up after a few dozen
 * kilobytes and blocks FFmpeg mid-write, which looks like the process freezing for no reason. Consumers therefore
 * receive parsed events and capped buffers instead of the raw streams.
 */
export default class FfmpegHandle extends EventEmitter<FfmpegHandleEvents> {
  static readonly PROGRESS_FD = 3;
  private static readonly MAX_CAPTURED_STDOUT_CHARS = 8 * 1024 * 1024;

  private readonly startedAtInMillis = performance.now();
  private readonly progressParser = new FfmpegProgressParser();
  private readonly logBuffer: FfmpegLogBuffer;
  private readonly exitResultPromise = Promise.withResolvers<FfmpegExitResult>();

  private capturedStdout: string | null;
  private spawnError: Error | null = null;
  private exitResult: FfmpegExitResult | null = null;
  private lastProgress: FfmpegProgress | null = null;
  private peakFps: number | null = null;

  constructor(
    private readonly childProcess: ChildProcess.ChildProcess,
    private readonly args: readonly string[],
    options: FfmpegHandleOptions,
  ) {
    super();

    this.logBuffer = new FfmpegLogBuffer(options.captureFullLog);
    this.capturedStdout = options.captureStdout ? '' : null;

    this.exitResultPromise.promise.catch(() => undefined);
    this.attachListeners();
  }

  getArgs(): readonly string[] {
    return this.args;
  }

  getPid(): number | undefined {
    return this.childProcess.pid;
  }

  hasExited(): boolean {
    return this.exitResult != null || this.spawnError != null;
  }

  getExitResult(): FfmpegExitResult | null {
    return this.exitResult;
  }

  /** Rejects only if the process could not be spawned at all; a non-zero exit code resolves. */
  waitForExit(): Promise<FfmpegExitResult> {
    return this.exitResultPromise.promise;
  }

  getLastProgress(): FfmpegProgress | null {
    return this.lastProgress;
  }

  getStats(): FfmpegRunStats {
    return {
      runtimeInMillis: this.exitResult?.runtimeInMillis ?? this.measureRuntimeInMillis(),
      peakFps: this.peakFps,
      lastProgress: this.lastProgress,
    };
  }

  /** The most recent log lines of any level. */
  getLogTail(): string {
    return this.logBuffer.getTail();
  }

  /** The most recent log lines of level `warning` or worse. */
  getLogProblems(): string {
    return this.logBuffer.getProblems();
  }

  getFullLog(): string | null {
    return this.logBuffer.getFullLog();
  }

  getStdout(): string {
    if (this.capturedStdout == null) {
      throw new Error('The stdout of the FFmpeg process was not captured – spawn it with `captureStdout` enabled');
    }
    return this.capturedStdout;
  }

  /** Asks FFmpeg to finish what it is doing and force-kills it if it does not exit within the grace period. */
  async shutdown(gracePeriodInMillis = 5_000): Promise<FfmpegExitResult> {
    if (this.exitResult != null) {
      return this.exitResult;
    }

    this.childProcess.kill('SIGTERM');
    const forceKillTimeout = setTimeout(() => this.childProcess.kill('SIGKILL'), gracePeriodInMillis);

    try {
      return await this.waitForExit();
    } finally {
      clearTimeout(forceKillTimeout);
    }
  }

  async kill(): Promise<FfmpegExitResult> {
    if (this.exitResult != null) {
      return this.exitResult;
    }

    this.childProcess.kill('SIGKILL');
    return this.waitForExit();
  }

  private attachListeners(): void {
    this.childProcess.on('error', (error) => {
      this.spawnError ??= error;
      this.exitResultPromise.reject(error);
    });
    this.childProcess.on('close', (exitCode, signal) => {
      if (this.spawnError != null) {
        return;
      }

      this.exitResult = {
        exitCode,
        signal,
        runtimeInMillis: this.measureRuntimeInMillis(),
      };
      this.exitResultPromise.resolve(this.exitResult);
      this.emit('exit', this.exitResult);
    });

    this.consumeLines(this.requireReadableStream(this.childProcess.stderr, 'stderr'), (line) => this.handleLogLine(line));
    this.consumeLines(this.requireReadableStream(this.childProcess.stdio[FfmpegHandle.PROGRESS_FD], 'progress'), (line) => this.handleProgressLine(line));

    if (this.capturedStdout != null) {
      this.consumeStdout(this.requireReadableStream(this.childProcess.stdout, 'stdout'));
    }
  }

  private consumeLines(stream: Stream.Readable, onLine: (line: string) => void): void {
    const readlineInterface = Readline.createInterface({ input: stream, crlfDelay: Infinity });
    readlineInterface.on('line', onLine);

    // Readline forwards the error of its input stream, and an unhandled one would take the whole process down
    readlineInterface.on('error', (error) => this.logStreamReadFailure(error));
  }

  private consumeStdout(stream: Stream.Readable): void {
    stream.setEncoding('utf-8');
    stream.on('data', (chunk: string) => {
      if (this.capturedStdout != null && this.capturedStdout.length < FfmpegHandle.MAX_CAPTURED_STDOUT_CHARS) {
        this.capturedStdout += chunk;
      }
    });
    stream.on('error', (error) => this.logStreamReadFailure(error));
  }

  private handleLogLine(rawLine: string): void {
    const logLine = FfmpegLogLineParser.parse(rawLine.trimEnd());
    this.logBuffer.push(logLine);
    this.emit('log', logLine);
  }

  private handleProgressLine(rawLine: string): void {
    const progress = this.progressParser.consumeLine(rawLine);
    if (progress == null) {
      return;
    }

    this.lastProgress = progress;
    if (progress.fps != null && (this.peakFps == null || progress.fps > this.peakFps)) {
      this.peakFps = progress.fps;
    }

    this.emit('progress', progress);
  }

  /**
   * Uses the monotonic clock instead of the wall clock: a transcode can easily run for hours, and an NTP step or a
   * daylight saving change in between would otherwise show up as part of the runtime.
   */
  private measureRuntimeInMillis(): number {
    return Math.round(performance.now() - this.startedAtInMillis);
  }

  private logStreamReadFailure(error: unknown): void {
    console.error(`Failed to read the output of an FFmpeg process (pid=${this.childProcess.pid})`, error);
  }

  private requireReadableStream(stream: unknown, name: string): Stream.Readable {
    if (!(stream instanceof Stream.Readable)) {
      throw new Error(`Expected the FFmpeg process to provide a readable '${name}' stream`);
    }
    return stream;
  }
}
