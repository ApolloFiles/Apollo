import ChildProcess from 'child_process';
import EventEmitter from 'events';
import Fs from 'fs';
import Path from 'path';
import { getProcessLogDir } from '../Constants';
import { IChildProcess, ChildProcessOptions } from './IChildProcess';

export default class ProcessManager {
  private readonly runningProcesses: IChildProcess[] = [];

  private shuttingDown: boolean = false;
  private onProcessExit?: () => void;

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

    ProcessManager.initProcessLog(process, options);

    return process;
  }

  private static initProcessLog(process: IChildProcess, processOptions: ChildProcessOptions): void {
    Fs.mkdirSync(getProcessLogDir(), {recursive: true});
    const logWriteStream = Fs.createWriteStream(Path.join(getProcessLogDir(), `${process.uniqueId}.log`));

    ProcessManager.writeToLog(logWriteStream, JSON.stringify({
      uniqueId: process.uniqueId,
      pid: process.pid,

      command: process.command,
      args: process.args,
      options: processOptions
    }, null, 2));
    ProcessManager.writeToLog(logWriteStream);

    process.on('stdout', (data) => ProcessManager.writeToLog(logWriteStream, data.toString('utf-8'), 'stdout'));
    process.on('stderr', (data) => ProcessManager.writeToLog(logWriteStream, data.toString('utf-8'), 'stderr'));

    process.once('exit', (code, signal, err) => {
      if (err) {
        ProcessManager.writeToLog(logWriteStream, `Exited with an error after ${new Date().getTime() - process.started.getTime()} ms:\n${JSON.stringify(err, null, 2)}`);
      } else {
        ProcessManager.writeToLog(logWriteStream, `Exited with code '${code}' and signal '${signal}' after ${new Date().getTime() - process.started.getTime()} ms`);
      }
    });
  }

  private static writeToLog(logStream: Fs.WriteStream, message?: string, eventToEmit?: 'stdout' | 'stderr'): void {
    try {
      if (message == null) {
        logStream.write('\n');
        return;
      }

      const eventString = eventToEmit ? `[${eventToEmit}] ` : '';
      logStream.write(`[${new Date().toISOString()}] ${eventString}${message}${message.endsWith('\n') ? '' : '\n'}`);
    } catch (err) {
      console.error(err); // TODO: Improve error handling
    }
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

  readonly uniqueId: string;
  readonly started: Date;

  readonly command: string;
  readonly args: string[];
  readonly options: ChildProcessOptions;

  bufferedStdOut = ApolloChildProcess.ZERO_BUFFER;
  bufferedStdErr = ApolloChildProcess.ZERO_BUFFER;

  private readonly spawnedProcess: ChildProcess.ChildProcess;

  constructor(uniqueId: string, command: string, args: string[], options: ChildProcessOptions) {
    super();

    this.uniqueId = uniqueId;
    this.started = new Date();

    this.command = command;
    this.args = args;
    this.options = options;

    this.spawnedProcess = ChildProcess.spawn(command, args, {
      cwd: this.options.cwd,
      stdio: this.options.stdio,
      env: this.options.env
    });

    this.spawnedProcess.on('error', (err) => {
      if (!(err instanceof Error)) {
        err = new Error(err);
      }

      this.emit('exit', null, null, err);
    });
    this.spawnedProcess.once('exit', (code, signal) => {
      const err = this.options.errorOnNonZeroExit && code !== 0 ? new Error(`Child process '${this.command}' exited with non zero code (code='${code}', uniqueId='${this.uniqueId}')`) : undefined;

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
