import ChildProcess from 'node:child_process';
import Os from 'node:os';
import Stream from 'node:stream';

type SpawnOptions = {
  cwd?: string;
}

type ProcessResult = {
  stdout: Buffer;
  stderr: Buffer;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
};

export default class BufferedChildProcess {
  private readonly processPromise = Promise.withResolvers<ProcessResult>();

  private readonly stdoutBuffer: Buffer[] = [];
  private readonly stderrBuffer: Buffer[] = [];
  private stdoutBufferBytes = 0;
  private stderrBufferBytes = 0;

  private constructor(
    private readonly process: ChildProcess.ChildProcessByStdio<null, Stream.Readable, Stream.Readable>,
  ) {
    this.attachEventListener();
  }

  private waitForExit(): Promise<ProcessResult> {
    return this.processPromise.promise;
  }

  private attachEventListener(): void {
    this.process.on('error', (error) => {
      this.processPromise.reject(error);
    });

    this.process.on('close', (code, signal) => {
      this.processPromise.resolve({
        stdout: Buffer.concat(this.stdoutBuffer),
        stderr: Buffer.concat(this.stderrBuffer),
        exitCode: code,
        signal,
      });
    });

    this.process.stdout.on('error', (error) => {
      this.processPromise.reject(error);
    });
    this.process.stderr.on('error', (error) => {
      this.processPromise.reject(error);
    });

    this.process.stdout.on('data', (data) => {
      if (!this.isBuffer(data)) {
        this.processPromise.reject(new Error('Expected stdout data to be a Buffer'));
        this.process.kill();
        return;
      }

      this.stdoutBuffer.push(data);
      this.stdoutBufferBytes += data.byteLength;

      this.logBufferSizeWarningIfNeeded('out');
    });

    this.process.stderr.on('data', (data) => {
      if (!this.isBuffer(data)) {
        this.processPromise.reject(new Error('Expected stderr data to be a Buffer'));
        this.process.kill();
        return;
      }

      this.stderrBuffer.push(data);
      this.stderrBufferBytes += data.byteLength;

      this.logBufferSizeWarningIfNeeded('err');
    });
  }

  private logBufferSizeWarningIfNeeded(type: 'out' | 'err'): void {
    const bufferName = type === 'out' ? 'stdout' : 'stderr';
    const bufferBytes = type === 'out' ? this.stdoutBufferBytes : this.stderrBufferBytes;

    if (bufferBytes > 10 * 1024 * 1024) {
      console.warn(`[WARN] [BufferedChildProcess] Buffer of ${bufferName} is exceeding 10 MiB (${(bufferBytes / 1024 / 1024).toFixed(2)} MiB): {pid=${this.process.pid}, spawnfile=${this.process.spawnfile}}`);
    }
  }

  private isBuffer(data: any): data is Buffer {
    return Buffer.isBuffer(data);
  }

  static async spawn(command: string, args: string[], options?: SpawnOptions): Promise<ProcessResult> {
    const childProcess = ChildProcess.spawn(command, args, {
      cwd: options?.cwd ?? Os.tmpdir(),
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    const bufferedChildProcess = new BufferedChildProcess(childProcess);
    return await bufferedChildProcess.waitForExit();
  }
}
