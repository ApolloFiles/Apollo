import ChildProcess from 'node:child_process';
import Os from 'node:os';

type SpawnOptions = {
  cwd?: string;
}

type ProcessResult = {
  exitCode: number | null,
  signal: NodeJS.Signals | null
};

export default class SimpleChildProcess {
  private readonly processPromise = Promise.withResolvers<ProcessResult>();

  private constructor(
    private readonly process: ChildProcess.ChildProcessByStdio<null, null, null>,
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
        exitCode: code,
        signal,
      });
    });
  }

  static async spawn(command: string, args: string[], options?: SpawnOptions): Promise<ProcessResult> {
    const childProcess = ChildProcess.spawn(command, args, {
      cwd: options?.cwd ?? Os.tmpdir(),
      stdio: ['ignore', 'inherit', 'inherit'],
      windowsHide: true,
    });

    const simpleChildProcess = new SimpleChildProcess(childProcess);
    return await simpleChildProcess.waitForExit();
  }
}
