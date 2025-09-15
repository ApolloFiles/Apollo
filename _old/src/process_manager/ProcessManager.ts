import ChildProcess from 'node:child_process';
import EventEmitter from 'node:events';
import Fs from 'node:fs';
import Path from 'node:path';
import { getProcessLogDir } from '../Constants';
import ApolloUser from '../user/ApolloUser';
import BackgroundProcess from './BackgroundProcess';
import { ChildProcessOptions, IChildProcess } from './IChildProcess';
import { IProcess } from './IProcess';

export default class ProcessManager {
  private readonly runningProcesses: IChildProcess[] = [];

  private shuttingDown: boolean = false;
  private onProcessExit?: () => void;

  register(process: IProcess): void {
    if (this.shuttingDown) {
      throw new Error(`Tried to register process while shutting down (uniqueId='${process.uniqueId}',type='${process.constructor.name}')`);
    }

    ProcessManager.initProcessLog(process);
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

    ProcessManager.initProcessLog(process);

    return process;
  }

  public getRunningProcesses(user?: ApolloUser): IChildProcess[] {
    if (user != null) {
      return this.runningProcesses.filter(process => process.user?.id === user.id);
    }

    return this.runningProcesses.slice();
  }

  private static initProcessLog(process: IProcess): void {
    Fs.mkdirSync(getProcessLogDir(), { recursive: true });
    const logWriteStream = Fs.createWriteStream(Path.join(getProcessLogDir(), `${process.uniqueId}.log`));

    let additionalInitValues: { [key: string]: any } = {};
    if (process instanceof ApolloChildProcess) {
      additionalInitValues = {
        pid: process.pid,
        command: process.command,
        args: process.args,
      };
    }

    ProcessManager.writeToLog(logWriteStream, JSON.stringify({
      uniqueId: process.uniqueId,
      options: process.options,

      ...additionalInitValues,
    }, null, 2));
    ProcessManager.writeToLog(logWriteStream);

    process.on('stdout', (data) => ProcessManager.writeToLog(logWriteStream, data.toString('utf-8'), 'stdout'));
    process.on('stderr', (data) => ProcessManager.writeToLog(logWriteStream, data.toString('utf-8'), 'stderr'));

    // TODO: put exit-event into IProcess interface and put provided arguments into additionalData
    if (process instanceof ApolloChildProcess) {
      process.once('exit', (code, signal, err) => this.logProcessDone(process, logWriteStream, err, { code, signal }));
    } else if (process instanceof BackgroundProcess) {
      process.result
        .then(() => this.logProcessDone(process, logWriteStream))
        .catch(err => this.logProcessDone(err, logWriteStream));
    } else {
      console.error(`Cannot init process log for unknown process type '${process.constructor.name}'`);
    }
  }

  private static logProcessDone(process: IProcess, logStream: Fs.WriteStream, err?: Error, additionalData?: { [key: string]: any }): void {
    const executionTime = process.started == null ? 0 : new Date().getTime() - process.started.getTime();

    let baseMessage: string;
    if (err) {
      baseMessage = `Exited with an error after ${executionTime} ms:\n${JSON.stringify(err, null, 2)}`;
    } else {
      baseMessage = `Exited after ${executionTime} ms`;
    }

    ProcessManager.writeToLog(logStream, `${baseMessage}${additionalData ? `\n\nAdditional data:\n${JSON.stringify(additionalData, null, 2)}` : ''}`);
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
