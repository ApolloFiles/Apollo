import ChildProcess from 'child_process';
import EventEmitter from 'events';

export type ChildProcessExitCode = number | null;
export type ChildProcessExitSignal = NodeJS.Signals | null;

export interface IChildProcess extends EventEmitter {
  readonly uniqueId: string;
  readonly pid: number | undefined;
  readonly started: Date;

  readonly command: string;
  readonly args: string[];

  readonly stdin: NodeJS.WritableStream | null;
  readonly bufferedStdOut: Buffer;
  readonly bufferedStdErr: Buffer;

  on<U extends keyof ChildProcessEvents>(event: U, listener: ChildProcessEvents[U]): this;
  once<U extends keyof ChildProcessEvents>(event: U, listener: ChildProcessEvents[U]): this;
  emit<U extends keyof ChildProcessEvents>(event: U, ...args: Parameters<ChildProcessEvents[U]>): boolean;
}

export interface ChildProcessOptions {
  cwd: string;
  stdio: Array<ChildProcess.IOType>;
  env: NodeJS.ProcessEnv;

  buffersStdOut: boolean;
  buffersStdErr: boolean;
  errorOnNonZeroExit: boolean;
}

export interface ChildProcessEvents {
  exit: (code: ChildProcessExitCode, signal: ChildProcessExitSignal, err?: Error) => void;

  stdout: (data: Buffer) => void;
  stderr: (data: Buffer) => void;
}
