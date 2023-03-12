import ChildProcess from 'node:child_process';
import Path from 'path';

class HlsManifest {
  private duration: number = -1;
  private absolutePathToManifest: string | null = null;

  private readonly onReadyListeners: (() => void)[] = [];

  setReady(absolutePathToManifest: string, duration: number): void {
    if (this.absolutePathToManifest != null) {
      throw new Error('HlsManifest already set to ready');
    }

    this.absolutePathToManifest = absolutePathToManifest;
    this.duration = duration;

    this.onReadyListeners.forEach((listener) => listener());
    this.onReadyListeners.length = 0;
  }

  async waitForReady(): Promise<{ path: string, duration: number }> {
    return new Promise((resolve) => {
      this.addOnReadyListener(() => {
        if (this.absolutePathToManifest == null || this.duration == -1) {
          throw new Error('HlsManifest not ready although onReadyListener was called: ' +
              JSON.stringify({absolutePathToManifest: this.absolutePathToManifest, duration: this.duration})
          );
        }

        resolve({path: this.absolutePathToManifest, duration: this.duration});
      });
    });
  }

  private addOnReadyListener(listener: () => void): void {
    if (this.absolutePathToManifest != null) {
      listener();
    }
    this.onReadyListeners.push(listener);
  }
}

export default class GstAppProcessWrapper {
  private static readonly COLON_CHAR: number = ':'.charCodeAt(0);

  private readonly gstAppProcess: ChildProcess.ChildProcess;
  private readonly gstAppProcessWorkingDir: string;

  private videoManifestReady = new HlsManifest();

  private stdoutBuffer = Buffer.alloc(64 * 1024);
  private stdoutBufferWriteOffset = 0;
  private stdoutBufferReadOffset = 0;

  private constructor(gstAppProcess: ChildProcess.ChildProcess, gstAppProcessWorkingDir: string) {
    this.gstAppProcess = gstAppProcess;
    this.gstAppProcessWorkingDir = gstAppProcessWorkingDir;
  }

  async waitForVideoManifest(): Promise<{ path: string, duration: number }> {
    return this.videoManifestReady.waitForReady(); // FIXME: Stop waiting on exit and error
  }

  private initialize() {
    this.gstAppProcess.stdout?.on('data', (data) => {
      if (!Buffer.isBuffer(data)) {
        throw new Error('Unexpected data type: ' + typeof data);
      }
      if (this.stdoutBuffer.length <= data.length) {
        throw new Error('stdoutBuffer is too small');
      }

      if (this.stdoutBufferWriteOffset + data.length > this.stdoutBuffer.length) {
        if (this.stdoutBufferWriteOffset == 0) {
          throw new Error('stdoutBuffer is too small');
        }

        this.stdoutBuffer.copy(this.stdoutBuffer, 0, this.stdoutBufferReadOffset, this.stdoutBufferWriteOffset);
        this.stdoutBufferWriteOffset -= this.stdoutBufferReadOffset;
        this.stdoutBufferReadOffset = 0;
      }

      this.stdoutBuffer.set(data, this.stdoutBufferWriteOffset);
      this.stdoutBufferWriteOffset += data.length;

      while (true) {
        const newLineIndex = this.stdoutBuffer.indexOf('\n', this.stdoutBufferReadOffset);
        if (newLineIndex === -1 || newLineIndex >= this.stdoutBufferWriteOffset) {
          break;
        }

        const lineData = this.stdoutBuffer.slice(this.stdoutBufferReadOffset, newLineIndex);
        this.stdoutBufferReadOffset = newLineIndex + 1;

        if (lineData.at(0) != GstAppProcessWrapper.COLON_CHAR ||
            lineData.at(1) != GstAppProcessWrapper.COLON_CHAR) {
          console.log('GstAppProcessWrapper: stdout:', lineData.toString());
          continue;
        }

        let lineDataReadOffset = 2;
        const consumeToNextColon = (): Buffer => {
          const colonIndex = lineData.indexOf(':', lineDataReadOffset);
          if (colonIndex === -1) {
            throw new Error('Unexpected lineData format');
          }

          const result = lineData.slice(lineDataReadOffset, colonIndex);
          lineDataReadOffset = colonIndex + 1;

          return result;
        };

        const command = consumeToNextColon().toString();
        switch (command) {
          case 'MANIFEST_READY':
            const relativePathToManifest = consumeToNextColon().toString();
            if (Path.isAbsolute(relativePathToManifest)) {
              throw new Error('Unexpected absolute path to manifest');
            }

            const duration = consumeToNextColon().toString();
            if (!/^[0-9]+$/.test(duration)) {
              throw new Error('Unexpected value for duration: ' + JSON.stringify(duration));
            }

            this.videoManifestReady.setReady(Path.join(this.gstAppProcessWorkingDir, relativePathToManifest), parseInt(duration));
            break;
          default:
            throw new Error('Unexpected command: ' + command);
        }
      }
    });

    this.gstAppProcess.stderr?.on('data', (data) => {
      // console.log('GstAppProcessWrapper: stderr:', data.toString());
    });

    this.gstAppProcess.on('error', (err) => {
      console.error('GstAppProcessWrapper: error:', err);
    });
    this.gstAppProcess.on('exit', (code, signal) => {
      console.log('GstAppProcessWrapper: exit:', code, signal);
      if (code === 127) {
        console.error('GstAppProcessWrapper: Exited with Code 127 - Please make sure gstreamer is installed');
      }
    });

    this.gstAppProcess.stdin?.on('error', (err) => {
      console.error('GstAppProcessWrapper: stdin-error:', err);
    });
    this.gstAppProcess.stdout?.on('error', (err) => {
      console.error('GstAppProcessWrapper: stdout-error:', err);
    });
    this.gstAppProcess.stderr?.on('error', (err) => {
      console.error('GstAppProcessWrapper: stderr-error:', err);
    });

    this.writeToStdin('STATE PLAYING\n').catch(console.error);
  }

  private async writeToStdin(data: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.gstAppProcess.stdin == null) {
        return reject(new Error('GstAppProcessWrapper: stdin is null'));
      }

      this.gstAppProcess.stdin.write(data, (err) => {
        if (err) {
          return reject(err);
        }

        resolve();
      });
    });
  }

  static wrapAndInitialize(process: ChildProcess.ChildProcess, workingDir: string): GstAppProcessWrapper {
    const wrappedGstProcess = new GstAppProcessWrapper(process, workingDir);
    wrappedGstProcess.initialize();

    return wrappedGstProcess;
  }
}
