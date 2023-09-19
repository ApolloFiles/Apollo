import ChildProcess from 'node:child_process';
import EventEmitter from 'node:events';

export type FfmpegMetrics = { [key: string]: string | number } & {
  frame?: number;
  fps?: number;
  speed?: number;
  time?: string;
}

export default class FfmpegProcess extends EventEmitter {
  private static readonly EXECUTABLE = 'ffmpeg';  // TODO: Make this configurable

  private readonly childProcess: ChildProcess.ChildProcess;

  constructor(args: string[], options: ChildProcess.SpawnOptions = {stdio: 'ignore'}) {
    super();
    this.childProcess = ChildProcess.spawn(FfmpegProcess.EXECUTABLE, args, options);

    let hwDecoding = 'none/unknown';
    this.childProcess.stderr?.on('data', (data) => {
      const dataAsString = data.toString();
      if (dataAsString.startsWith('frame=')) {
        this.emit('metrics', {
          hwDecoding,
          ...FfmpegProcess.parseMetrics(dataAsString)
        });

        return;
      }

      if (dataAsString.startsWith('Using auto hwaccel type ')) {
        hwDecoding = dataAsString.split(' ')[4];
      }
    });
  }

  on(event: 'metrics', listener: (metrics: FfmpegMetrics) => void): this;
  on(event: 'metrics', listener: (...args: any[]) => void): this {
    return super.on(event, listener);
  }

  emit(event: 'metrics', metrics: FfmpegMetrics): boolean;
  emit(event: 'metrics', ...args: any[]): boolean {
    return super.emit(event, ...args);
  }

  waitForSuccessExit(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.childProcess.on('error', (err) => reject(err));
      this.childProcess.on('exit', (code) => {
        if (code !== 0) {
          reject(new Error(`FFmpeg process exited with code ${code}`));
          return;
        }
        resolve();
      });
    });
  }

  waitForExit(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.childProcess.on('error', (err) => reject(err));
      this.childProcess.on('exit', (code) => {
        if (typeof code != 'number') {
          reject(new Error(`FFmpeg process exited with code ${code}`));
          return;
        }

        resolve(code);
      });
    });
  }

  getProcess(): ChildProcess.ChildProcess {
    return this.childProcess;
  }

  async shutdown(timeout = 5000): Promise<void> {
    if (this.childProcess.killed || this.childProcess.exitCode !== null) {
      return;
    }

    return new Promise((resolve, reject) => {
      this.childProcess.on('exit', () => resolve());

      this.childProcess.kill('SIGKILL');
      setTimeout(() => this.terminate().then(resolve).catch(reject), timeout);
    });
  }

  async terminate(): Promise<void> {
    if (this.childProcess.killed || this.childProcess.exitCode !== null) {
      return;
    }

    this.childProcess.kill('SIGKILL');
    return new Promise((resolve) => this.childProcess.on('exit', () => resolve()));
  }

  private static parseMetrics(dataAsString: string): FfmpegMetrics {
    const metrics: FfmpegMetrics = {};

    const pattern = /(\w+)=(\S+)/g;

    let match;
    while (match = pattern.exec(dataAsString)) {
      const key = match[1];
      const value = match[2];

      if (key === 'frame' || key === 'fps' || key === 'dup' || key === 'drop') {
        metrics[key] = parseInt(value, 10);
      } else if (key === 'speed' || key === 'q') {
        metrics[key] = parseFloat(value);
      } else {
        metrics[key] = value;
      }
    }

    return metrics;
  }
}
