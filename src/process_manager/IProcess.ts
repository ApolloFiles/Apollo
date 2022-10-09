import EventEmitter from 'events';
import AbstractUser from '../AbstractUser';

export interface IProcess extends EventEmitter {
  readonly uniqueId: string;
  readonly started: Date;
  readonly user?: AbstractUser;

  readonly options?: IProcessOptions;
  readonly bufferedStdOut: Buffer;
  readonly bufferedStdErr: Buffer;

  on<U extends keyof IProcessEvents>(event: U, listener: IProcessEvents[U]): this;
  once<U extends keyof IProcessEvents>(event: U, listener: IProcessEvents[U]): this;
  emit<U extends keyof IProcessEvents>(event: U, ...args: Parameters<IProcessEvents[U]>): boolean;
}

export interface IProcessOptions {
  // TODO: allow for number value to limit buffer size to n bytes
  buffersStdOut: boolean;
  buffersStdErr: boolean;
}

export interface IProcessEvents {
  stdout: (data: Buffer) => void;
  stderr: (data: Buffer) => void;
}
