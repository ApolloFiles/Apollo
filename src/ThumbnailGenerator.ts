import ChildProcess, { SpawnOptionsWithoutStdio } from 'child_process';
import Fs from 'fs';
import { EOL } from 'os';
import Path from 'path';
import path from 'path';
import sharp, { Sharp } from 'sharp';
import IUserFile from './files/IUserFile';

export default class ThumbnailGenerator {
  readonly sharpMimeTypes: string[];

  constructor() {
    this.sharpMimeTypes = [];

    // TODO: cleanup and write tests for all file types if 'file' does even recognize all of them
    if (sharp.format.webp.input.stream) {
      this.sharpMimeTypes.push('image/webp');
    }
    if (sharp.format.webp.output.stream) {
      this.sharpMimeTypes.push('image/webp');
    }
    if (sharp.format.jpeg.output.stream) {
      this.sharpMimeTypes.push('image/jpeg');
    }
    if (sharp.format.png.input.stream) {
      this.sharpMimeTypes.push('image/png');
    }
    if (sharp.format.tiff.input.stream) {
      this.sharpMimeTypes.push('image/tiff');
    }
    if (sharp.format.gif.input.stream) {
      this.sharpMimeTypes.push('image/gif');
    }
    if (sharp.format.avif?.input?.stream) {
      this.sharpMimeTypes.push('image/avif');
    }
    if (sharp.format.fits.input.stream) {
      this.sharpMimeTypes.push('image/fits');
    }
    if (sharp.format.heif.input.stream) {
      this.sharpMimeTypes.push('image/heif');
    }
    if (sharp.format.pdf.input.stream) {
      this.sharpMimeTypes.push('application/pdf');
    }
    if (sharp.format.svg.input.stream) {
      this.sharpMimeTypes.push('image/svg+xml');
    }
    if (sharp.format.ppm.input.stream) {
      this.sharpMimeTypes.push('image/x-portable-pixmap');
      this.sharpMimeTypes.push('image/x-portable-anymap');
    }
  }

  /*
   * FIXME: Everything below has been copied from NASWeb, the predecessor of Apollo – This needs heavy refactoring :p
   */

  async generateThumbnail(file: IUserFile): Promise<{ mime: string, data: Buffer } | null> {
    const mimeType = await file.getMimeType();

    if (mimeType == null) {
      return null;
    }

    if (!this.sharpMimeTypes.includes(mimeType)) {
      if (mimeType.startsWith('video/')) {
        return {
          mime: 'image/png',
          data: await (await this.generateVideoThumbnail(file)).img.png().toBuffer({resolveWithObject: false})
        };
      }

      return null;
    }

    const sharpInstance = sharp({
      failOnError: false,
      sequentialRead: true,
      density: 300
    })
        .resize(256, 256, {
          fit: 'inside',
          fastShrinkOnLoad: true,
          withoutEnlargement: true
        })
        .png();

    file.getReadStream().pipe(sharpInstance);

    return {
      mime: 'image/png',
      data: await sharpInstance.toBuffer()
    };
  }

  private async generateVideoThumbnail(file: IUserFile, sampleSize: number = 3, width = 500): Promise<{ img: Sharp }> {
    if (sampleSize <= 0) throw new Error('sampleSize has to be positive');

    const filePath = await file.getAbsolutePathOnHost();

    if (filePath == null) throw new Error('filePath is null');

    return new Promise(async (resolve, reject): Promise<void> => {
      let videoDuration = 0;

      const ffProbeProcess = this.spawn('ffprobe', ['-select_streams', 'v:0', '-show_entries', 'format=duration', '-print_format', 'json=c=1', filePath]).process;
      let ffProbeOutStr = '';
      ffProbeProcess.stdout.on('data', (chunk) => {
        ffProbeOutStr += chunk.toString();
      });
      ffProbeProcess.on('error', console.error);
      ffProbeProcess.on('close', (code) => {
        if (code == 0) {
          const ffProbeOut = JSON.parse(ffProbeOutStr);

          if (typeof ffProbeOut?.format?.duration == 'string') {
            videoDuration = parseFloat(ffProbeOut.format.duration);
          } else if (typeof ffProbeOut?.format?.duration == 'number') {
            videoDuration = ffProbeOut.format.duration;
          }
        } else {
          // TODO: Use ffmpeg as fallback? or just use the first frame?
          // let ppOut = '';
          // const pp = processManager.spawn(ffMpegPath, ['-bitexact', '-nostats', '-i', absPath, '-map', 'v:0', '-c:v', 'copy', '-f', 'null', '/dev/null']).process;
          // pp.stderr.on('data', (chunk) => {
          //   ppOut += chunk.toString();
          // });
          // pp.on('error', console.error);
          // pp.on('close', (code) => {
          //   if (code == 0) {
          //     let line = ppOut.substring(ppOut.lastIndexOf('frame='));
          //     line = line.substring(0, line.indexOf('\n'));
          //
          //     for (const s of line.split(' ')) {
          //       const args = s.split('=', 2);
          //
          //       if (args[0] == 'time') {
          //         console.log('Time:', args[1]);
          //       }
          //     }
          //   }
          // });
        }

        // FIXME: Delete cwd when done
        const cwd = Fs.mkdtempSync(Path.join(file.getOwner().getTmpFileSystem().getAbsolutePathOnHost(), 'thumbnail-'));
        const args = ['-i', filePath];

        args.unshift('-ss', Math.floor(0.1 * videoDuration).toString(), '-noaccurate_seek');
        args.push('-map', 'v:0', '-vf', `select='eq(pict_type,PICT_TYPE_I)',scale=${width}:-2`, '-vsync', 'vfr');
        args.push('-vframes', sampleSize.toString(), 'frame%01d.png');

        const processInfo = this.spawn('ffmpeg', args, {cwd: cwd});
        const process = processInfo.process;
        process.on('error', (err) => reject(err));

        let outBuff = '';
        let errBuff = '';

        process.stdout.on('data', (chunk) => {
          outBuff += chunk.toString();
        });
        process.stderr.on('data', (chunk) => {
          errBuff += chunk.toString();
        });

        process.on('close', async (code): Promise<void> => {
          if (code != 0) {
            return reject(new Error(`Executing command 'ffmpeg' exited with code ${code} (log=${/*processInfo.logFile*/ '-'},stderr='${errBuff}',stdout='${outBuff}')`));
          }

          let highestDelta = -1;
          let result: Sharp | null = null;
          for (let i = 0; i < sampleSize; ++i) {
            const pic = sharp(path.join(cwd, `frame${i + 1}.png`));
            const picTrimmedStats = await pic.clone().trim().stats();

            const delta = Color.deltaESquared({r: 0, g: 0, b: 0}, picTrimmedStats.dominant) *
                Color.deltaESquared({r: 255, g: 255, b: 255}, picTrimmedStats.dominant) * (await pic.stats()).entropy;

            if (highestDelta == -1 || delta > highestDelta) {
              highestDelta = delta;
              result = pic;
            }
          }

          resolve({
            img: result as Sharp
          });
        });
      });
    });
  }

  private spawn(command: string, args: ReadonlyArray<string>, options?: SpawnOptionsWithoutStdio & { allowTermination?: boolean }) {
    // const logFile = path.join(this.logDirectory, `${this.taskId++}.log`);
    // const logStream = fs.createWriteStream(logFile, {flags: 'a'});
    // ProcessManager.log({logStream}, 'ProcessManager', `Starting process ${JSON.stringify({
    //   systemTime: new Date().toUTCString(),
    //   command,
    //   args,
    //   allowTermination: options?.allowTermination
    // }, null, 2)}`);

    const process = ChildProcess.spawn(command, args, options);
    const processData = {process, /*logStream, logFile,*/ allowTermination: options?.allowTermination};

    // ProcessManager.log(processData, 'ProcessManager', `Got PID #${process.pid}`);

    // this.runningProcesses.push(processData);

    process.stdout.on('data', (chunk) => /*ProcessManager.log(processData, 'OUT', chunk)*/ console.log('[OUT]' + chunk.toString()));
    process.stderr.on('data', (chunk) => /*ProcessManager.log(processData, 'ERR', chunk)*/ console.error('[ERR]' + chunk.toString()));

    process.on('error',
        (err) => /* ProcessManager.log(processData, 'ProcessManager', `An error occurred:${EOL}${err.stack} ${JSON.stringify(err, null, 2)}` */ console.error(`An error occurred:${EOL}${err.stack} ${JSON.stringify(err, null, 2)}`));
    process.on('exit',
        (code, signal) => /* ProcessManager.log(processData, 'ProcessManager', `The process exited (code=${code}, signal=${signal}).` */ console.error(`The process exited (code=${code}, signal=${signal}).`));

    process.on('close', (code, signal) => {
      console.log(`The process exited and closed all stdio streams (code=${code}, signal=${signal}).`);
      // ProcessManager.log(processData, 'ProcessManager', `The process exited and closed all stdio streams (code=${code}, signal=${signal}).`);

      // this.removeProcess(processData);
    });

    return processData;
  }
}

type ColorRGB = { r: number, g: number, b: number };
type ColorXYZ = { x: number, y: number, z: number };
type ColorLab = { L: number, a: number, b: number };

/**
 * @author NudelErde (https://github.com/NudelErde)
 */
class Color {
  static RGBtoXYZ(c: ColorRGB) {
    // RGB Working Space: sRGB
    // Reference White: D65
    return {
      x: 0.412453 * c.r + 0.357580 * c.g + 0.189423 * c.b,
      y: 0.212671 * c.r + 0.715160 * c.g + 0.072169 * c.b,
      z: 0.019334 * c.r + 0.119193 * c.g + 0.950227 * c.b
    };
  }

  // XYZ to CIELab
  static XYZtoLab(c: ColorXYZ): ColorLab {
    const Xo = 244.66128; // Reference white
    const Yo = 255.0;
    const Zo = 277.63227;

    return {
      L: 116 * this.f(c.y / Yo) - 16,
      a: 500 * (this.f(c.x / Xo) - this.f(c.y / Yo)),
      b: 200 * (this.f(c.y / Yo) - this.f(c.z / Zo))
    };
  }

  // RGB to CIELab
  static RGBtoLab(c: ColorRGB): ColorLab {
    return this.XYZtoLab(this.RGBtoXYZ(c));
  }

  static deltaE(c1: ColorRGB, c2: ColorRGB): number {
    return Math.sqrt(this.deltaESquared(c1, c2));
  }

  static deltaESquared(c1: ColorRGB, c2: ColorRGB): number {
    const c1Lab = this.RGBtoLab(c1);
    const c2Lab = this.RGBtoLab(c2);

    const dL = c1Lab.L - c2Lab.L;
    const da = c1Lab.a - c2Lab.a;
    const db = c1Lab.b - c2Lab.b;

    return dL * dL + da * da + db * db;
  }

  private static f(input: number): number {
    return input > 0.008856 ? Math.cbrt(input) : (841 / 108) * input + 4 / 29;
  }
}
