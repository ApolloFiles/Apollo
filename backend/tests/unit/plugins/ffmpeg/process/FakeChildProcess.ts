import type ChildProcess from 'node:child_process';
import EventEmitter from 'node:events';
import Stream from 'node:stream';

/** A stand-in for a spawned FFmpeg process, wired up like {@link FfmpegProcessRunner} spawns one. */
export default class FakeChildProcess extends EventEmitter {
  readonly pid = 4242;
  readonly stdout = new Stream.PassThrough();
  readonly stderr = new Stream.PassThrough();
  readonly progress = new Stream.PassThrough();
  readonly receivedKillSignals: (NodeJS.Signals | number)[] = [];
  readonly stdio = [null, this.stdout, this.stderr, this.progress];

  /** Emits `killed`, so a test can decide whether this signal makes the process exit. */
  kill(signal?: NodeJS.Signals | number): boolean {
    this.receivedKillSignals.push(signal ?? 'SIGTERM');
    this.emit('killed', signal ?? 'SIGTERM');
    return true;
  }

  simulateClose(exitCode: number | null, signal: NodeJS.Signals | null = null): void {
    this.stdout.end();
    this.stderr.end();
    this.progress.end();
    this.emit('close', exitCode, signal);
  }

  simulateSpawnFailure(error: Error): void {
    this.emit('error', error);
  }

  asChildProcess(): ChildProcess.ChildProcess {
    return this as unknown as ChildProcess.ChildProcess;
  }
}

/** Lets the streams hand their buffered data to the readline interfaces reading them. */
export function flushStreams(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}
