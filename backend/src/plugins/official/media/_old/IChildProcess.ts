import ChildProcess from 'node:child_process';
import type { IProcess, IProcessEvents, IProcessOptions } from './IProcess.js';

export type ChildProcessExitCode = number | null;
export type ChildProcessExitSignal = NodeJS.Signals | null;

/**
 * @deprecated
 */
export interface IChildProcess extends IProcess {
  readonly pid: number | undefined;

  readonly command: string;
  readonly args: string[];

  readonly stdin: NodeJS.WritableStream | null;

  on<U extends keyof ChildProcessEvents>(event: U, listener: ChildProcessEvents[U]): this;
  once<U extends keyof ChildProcessEvents>(event: U, listener: ChildProcessEvents[U]): this;
  emit<U extends keyof ChildProcessEvents>(event: U, ...args: Parameters<ChildProcessEvents[U]>): boolean;
}

export interface ChildProcessOptions extends IProcessOptions {
  cwd: string;
  stdio: Array<ChildProcess.IOType>;
  env: NodeJS.ProcessEnv;

  errorOnNonZeroExit: boolean;
}

export interface ChildProcessEvents extends IProcessEvents {
  exit: (code: ChildProcessExitCode, signal: ChildProcessExitSignal, err?: Error) => void;
}
