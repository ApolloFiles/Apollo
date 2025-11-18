import ChildProcess from 'node:child_process';
import EventEmitter from 'node:events';
import { singleton } from 'tsyringe';
import type ApolloUser from '../../../../user/ApolloUser.js';
import type { ChildProcessOptions, IChildProcess } from './IChildProcess.js';
import type { IProcess } from './IProcess.js';

@singleton()
export default class ProcessManager {
  private readonly runningProcesses: IChildProcess[] = [];

  private shuttingDown: boolean = false;
  private onProcessExit?: () => void;

  register(process: IProcess): void {
    if (this.shuttingDown) {
      throw new Error(`Tried to register process while shutting down (uniqueId='${process.uniqueId}',type='${process.constructor.name}')`);
    }
  }

  create(uniqueId: string, command: string, args: string[], options: ChildProcessOptions): IChildProcess {
    if (this.shuttingDown) {
      throw new Error(`Tried to create a process while shutting down (uniqueId='${uniqueId}',command='${command}')`);
    }

    const process = new ApolloChildProcess(uniqueId, command, args, options);

    this.runningProcesses.push(process);
    process.once('exit', () => {
      this.runningProcesses.splice(this.runningProcesses.indexOf(process), 1);

      if (this.onProcessExit) {
        this.onProcessExit();
      }
    });

    return process;
  }

  public getRunningProcesses(user?: ApolloUser): IChildProcess[] {
    if (user != null) {
      return this.runningProcesses.filter(process => process.user?.id === user.id);
    }

    return this.runningProcesses.slice();
  }

  async shutdown(timeoutInMs = 5000): Promise<void> {
    return new Promise((resolve): void => {
      this.shuttingDown = true;
      this.onProcessExit = () => {
        if (this.runningProcesses.length <= 0) {
          resolve();
        }
      };

      if (this.runningProcesses.length <= 0) {
        return resolve();
      }

      console.log(`Shutting down ${this.runningProcesses.length} child processes...`);
      for (const runningProcess of this.runningProcesses) {
        if (runningProcess.pid == null) {
          continue;
        }

        process.kill(runningProcess.pid, 'SIGTERM');
      }

      setTimeout(() => {
        if (this.runningProcesses.length <= 0) {
          return resolve();
        }

        for (const runningProcess of this.runningProcesses) {
          if (runningProcess.pid == null) {
            continue;
          }

          console.error(`Forcefully killing child process (uniqueId='${runningProcess.uniqueId}', pid='${runningProcess.pid}')...`);
          process.kill(runningProcess.pid, 'SIGKILL');
        }

        resolve();
      }, timeoutInMs);
    });
  }
}

class ApolloChildProcess extends EventEmitter implements IChildProcess {
  private static readonly ZERO_BUFFER = Buffer.alloc(0);

  public readonly uniqueId: string;
  public readonly started: Date;
  public readonly user?: ApolloUser;

  public readonly command: string;
  public readonly args: string[];
  public readonly options: ChildProcessOptions;

  bufferedStdOut = ApolloChildProcess.ZERO_BUFFER;
  bufferedStdErr = ApolloChildProcess.ZERO_BUFFER;

  private readonly spawnedProcess: ChildProcess.ChildProcess;

  constructor(uniqueId: string, command: string, args: string[], options: ChildProcessOptions, user?: ApolloUser) {
    super();

    this.uniqueId = uniqueId;
    this.started = new Date();
    this.user = user;

    this.command = command;
    this.args = args;
    this.options = Object.freeze(options);

    this.spawnedProcess = ChildProcess.spawn(command, args, {
      cwd: this.options.cwd,
      stdio: this.options.stdio,
      env: this.options.env,
    });

    this.spawnedProcess.on('error', (err) => {
      if (!(err instanceof Error)) {
        err = new Error(err);
      }

      this.emit('exit', null, null, err);
    });

    const hasSharedStdio = this.options.stdio.find((stream) => stream !== 'pipe' && stream !== 'ignore') != null;
    this.spawnedProcess.once(hasSharedStdio ? 'exit' : 'close', (code, signal) => {
      const err = this.options.errorOnNonZeroExit && code !== 0 ? new Error(`Child process '${this.command}' exited with non zero code (code='${code}', signal='${signal}', uniqueId='${this.uniqueId}')`) : undefined;

      this.emit('exit', code, signal, err);
    });

    this.spawnedProcess.stdout?.on('data', (data) => this.stdStreamListener('stdout', data));
    this.spawnedProcess.stderr?.on('data', (data) => this.stdStreamListener('stderr', data));
  }

  get pid(): number | undefined {
    return this.spawnedProcess.pid;
  }

  get stdin(): NodeJS.WritableStream | null {
    return this.spawnedProcess.stdin;
  }

  private stdStreamListener(eventToEmit: 'stdout' | 'stderr', data?: any): void {
    if (typeof data === 'string') {
      data = Buffer.from(data);
    } else if (!Buffer.isBuffer(data)) {
      throw new Error('Unexpected data type: ' + typeof data);
    }

    if (eventToEmit === 'stdout' && this.options.buffersStdOut) {
      this.bufferedStdOut = Buffer.concat([this.bufferedStdOut, data]);
    } else if (eventToEmit === 'stderr' && this.options.buffersStdErr) {
      this.bufferedStdErr = Buffer.concat([this.bufferedStdErr, data]);
    }

    this.emit(eventToEmit, data);
  }
}
