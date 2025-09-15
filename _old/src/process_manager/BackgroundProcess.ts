import Crypto from 'node:crypto';
import EventEmitter from 'node:events';
import { getProcessManager } from '../Constants';
import ApolloUser from '../user/ApolloUser';
import { IProcess, IProcessOptions } from './IProcess';

export type BackgroundTaskArg = { log: (msg: string | number) => void, error: (msg: string | number) => void };
export type BackgroundTask<T> = (context: BackgroundTaskArg) => (T | Promise<T>);

export default class BackgroundProcess<T> extends EventEmitter implements IProcess {
  private static readonly ZERO_BUFFER = Buffer.alloc(0);

  public readonly uniqueId = Crypto.randomUUID();
  public readonly started = new Date();
  public readonly user?: ApolloUser;

  private readonly task: BackgroundTask<T>;
  public readonly options?: IProcessOptions;

  private _bufferedStdOut: Buffer = BackgroundProcess.ZERO_BUFFER;
  private _bufferedStdErr: Buffer = BackgroundProcess.ZERO_BUFFER;

  public readonly result: Promise<T>;

  constructor(task: BackgroundTask<T>, options?: IProcessOptions, user?: ApolloUser) {
    super();

    this.task = task;
    this.options = options;

    this.user = user;

    this.result = this.startTaskExecution();

    getProcessManager().register(this);
  }

  get bufferedStdOut(): Buffer {
    return this._bufferedStdOut;
  }

  get bufferedStdErr(): Buffer {
    return this._bufferedStdErr;
  }

  private async startTaskExecution(): Promise<T> {
    return new Promise((resolve, reject) => {
      try {
        const taskResult = this.task({
          log: (msg: string | number) => this.handleTaskLog('stdout', msg),
          error: (msg: string | number) => this.handleTaskLog('stderr', msg),
        });

        if (taskResult instanceof Promise) {
          taskResult.then(resolve)
            .catch(reject);
          return;
        }

        resolve(taskResult);
      } catch (err) {
        reject(err);
      }
    });
  }

  private handleTaskLog(eventToEmit: 'stdout' | 'stderr', data?: any): void {
    if (typeof data == 'number') {
      data = data.toString();
    }

    if (typeof data == 'string') {
      data = Buffer.from(data);
    } else if (!Buffer.isBuffer(data)) {
      throw new Error('Unexpected data type: ' + typeof data);
    }

    if (eventToEmit === 'stdout' && this.options?.buffersStdOut) {
      this._bufferedStdOut = Buffer.concat([this._bufferedStdOut, data]);
    } else if (eventToEmit === 'stderr' && this.options?.buffersStdErr) {
      this._bufferedStdErr = Buffer.concat([this._bufferedStdErr, data]);
    }

    this.emit(eventToEmit, data);
  }
}
