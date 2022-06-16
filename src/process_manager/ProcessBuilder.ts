import ChildProcess from 'child_process';
import Crypto from 'crypto';
import Fs from 'fs';
import AbstractUser from '../AbstractUser';
import { getProcessManager } from '../Constants';
import TmpFiles from '../TmpFiles';
import { ChildProcessExitCode, ChildProcessExitSignal, ChildProcessOptions, IChildProcess } from './IChildProcess';

// TODO: Allow configuring uid and gui for processes and use them to ensure that only the cwd can be accessed (or at least written to).
//       Alternatively maybe chroot could be used to isolate the process
export default class ProcessBuilder {
  private _command: string;
  private _args: string[];
  private _cwd: string | null = null;

  private _user: AbstractUser | null = null;

  private _env: ChildProcessOptions['env'] = process.env;
  private _stdio: ChildProcessOptions['stdio'] = ['ignore', 'pipe', 'pipe'];
  private _buffersStdOut = false;
  private _buffersStdErr = false;
  private _errorOnNonZeroExit = false;

  constructor(command: string, args: string[] = []) {
    this._command = command;
    this._args = args;
  }

  /**
   * Creates a new process instance with the given attributes (and starts it).
   * It can be invoked multiple times to create multiple processes with the same or similar attributes.
   */
  run(): IChildProcess {
    const processUniqueId = Crypto.randomUUID();
    const cwd = this.cwd ?? TmpFiles.createTmpDir(undefined, `process_${processUniqueId}`);

    const process = getProcessManager().create(processUniqueId, this.command, this.args, {
      cwd,
      stdio: this.stdio,
      env: this.env,

      buffersStdOut: this.buffersStdOut,
      buffersStdErr: this.buffersStdErr,
      errorOnNonZeroExit: this.errorsOnNonZeroExit
    });

    if (this.cwd == null) {
      // Delete tmp-cwd if it doesn't contain any files
      try {
        Fs.rmdirSync(cwd);
      } catch (err: any) {
        if (err.code !== 'ENOTEMPTY' && err.code !== 'ENOENT') {
          console.error(`Unable to delete child_process tmp-cwd-dir: ${err.message}`);
        }
      }
    }

    return process;
  }

  runPromised(): Promise<{ process: IChildProcess, code: ChildProcessExitCode, signal: ChildProcessExitSignal, err?: Error }> {
    return new Promise((resolve) => {
      const process = this.run();
      process.on('exit', (code, signal, err) => resolve({process, code, signal, err}));
    });
  }

  /* Getter */

  get command(): string {
    return this._command;
  }

  get args(): string[] {
    return this._args;
  }

  get cwd(): string | null {
    return this._cwd;
  }

  get user(): AbstractUser | null {
    return this._user;
  }

  get env(): ChildProcessOptions['env'] {
    return this._env;
  }

  get stdio(): ChildProcessOptions['stdio'] {
    return this._stdio;
  }

  get buffersStdOut(): boolean {
    return this._buffersStdOut;
  }

  get buffersStdErr(): boolean {
    return this._buffersStdErr;
  }

  get errorsOnNonZeroExit(): boolean {
    return this._errorOnNonZeroExit;
  }

  /* Chainable setter */

  withCommand(command: string): ProcessBuilder {
    this._command = command;
    return this;
  }

  withArgs(args: string[]): ProcessBuilder {
    this._args = args;
    return this;
  }

  withCwd(cwd: string | null): ProcessBuilder {
    this._cwd = cwd;
    return this;
  }

  withUser(user: AbstractUser | null): ProcessBuilder {
    this._user = user;
    return this;
  }

  withEmptyEnv(): ProcessBuilder {
    this._env = {};
    return this;
  }

  withEnv(env: ChildProcessOptions['env']): ProcessBuilder {
    this._env = env;
    return this;
  }

  withEnvVar(key: string, value: string | number): ProcessBuilder {
    this._env[key] = value.toString();
    return this;
  }

  withIo(stdin?: ChildProcess.IOType, stdout?: ChildProcess.IOType, stderr?: ChildProcess.IOType): ProcessBuilder {
    this._stdio = [stdin ?? this._stdio[0], stdout ?? this._stdio[1], stderr ?? this._stdio[2]];
    return this;
  }

  withStdIn(type: ChildProcess.IOType = 'pipe'): ProcessBuilder {
    this._stdio[0] = type;
    return this;
  }

  bufferStdOut(bufferStdOut = true): ProcessBuilder {
    this._buffersStdOut = bufferStdOut;
    return this;
  }

  bufferStdErr(bufferStdErr = true): ProcessBuilder {
    this._buffersStdErr = bufferStdErr;
    return this;
  }

  errorOnNonZeroExit(errorOnNonZeroExit = true): ProcessBuilder {
    this._errorOnNonZeroExit = errorOnNonZeroExit;
    return this;
  }
}
