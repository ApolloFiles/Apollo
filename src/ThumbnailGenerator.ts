import Path from 'path';
import sharp, { Sharp } from 'sharp';
import IUserFile from './files/IUserFile';
import VideoAnalyser from './media/video/analyser/VideoAnalyser';
import ProcessBuilder from './process_manager/ProcessBuilder';

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
      let thumbnail: Sharp | null = null;

      if (mimeType.startsWith('video/') || mimeType.startsWith('audio/')) {
        thumbnail = await this.extractVideoCover(file);
      }

      if (thumbnail == null && mimeType.startsWith('video/')) {
        thumbnail = (await ThumbnailGenerator.generateVideoThumbnail(file)).img;
      }

      if (thumbnail != null) {
        return {
          mime: 'image/png',
          data: await thumbnail.png().toBuffer({resolveWithObject: false})
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

  private async extractVideoCover(file: IUserFile): Promise<Sharp | null> {
    const filePath = await file.getAbsolutePathOnHost();
    if (filePath == null) throw new Error('filePath is null');


    const videoStreams = await VideoAnalyser.analyze(filePath, true);
    const potentialCoverStreams = videoStreams.streams.filter(stream => stream.codecType == 'video' && stream.avgFrameRate == '0/0');

    let coverStream: { fileName: string, streamSpecifier: string } | null = null;
    for (const stream of potentialCoverStreams) {
      if (coverStream == null ||
          (stream.tags.mimetype != null && this.sharpMimeTypes.includes(stream.tags.mimetype.toLowerCase()))) {
        coverStream = {fileName: stream.tags.filename ?? 'extracted_cover.png', streamSpecifier: `0:${stream.index}`};
      }

      if (stream.tags.filename?.toLowerCase().startsWith('cover.')) {
        break;
      }
    }

    if (coverStream == null) {
      return null;
    }

    // FIXME: Delete cwd when done
    // FIXME: write lock on cwd
    const cwdFile = await file.getOwner().getTmpFileSystem().createTmpDir('thumbnail-');
    const cwd = cwdFile.getAbsolutePathOnHost();
    if (cwd == null) {
      throw new Error('cwd is null');
    }

    const args = ['-i', filePath, '-map', coverStream.streamSpecifier, '-frames', '1', '-f', 'image2', coverStream.fileName];

    const childProcess = await new ProcessBuilder('ffmpeg', args)
        .errorOnNonZeroExit()
        .withCwd(cwd)
        .runPromised();

    if (childProcess.err) {
      throw childProcess.err;
    }

    return sharp(Path.join(cwd, coverStream.fileName));
  }

  private static async generateVideoThumbnail(file: IUserFile, sampleSize: number = 3, width = 500): Promise<{ img: Sharp }> {
    if (sampleSize <= 0) throw new Error('sampleSize has to be positive');

    const filePath = await file.getAbsolutePathOnHost();

    if (filePath == null) throw new Error('filePath is null');

    let videoDuration = 0;

    // TODO: Create hardlink of file to cwd or ensure that process cannot modify the file
    const probeChildProcess = await new ProcessBuilder('ffprobe', ['-select_streams', 'v:0', '-show_entries', 'format=duration', '-print_format', 'json=c=1', filePath])
        .bufferStdOut()
        .runPromised();

    if (probeChildProcess.err != null) {
      console.error(probeChildProcess.err);
    } else if (probeChildProcess.code == 0) {
      const ffProbeOut = JSON.parse(probeChildProcess.process.bufferedStdOut.toString('utf-8'));

      if (typeof ffProbeOut?.format?.duration == 'string') {
        videoDuration = parseFloat(ffProbeOut.format.duration);
      } else if (typeof ffProbeOut?.format?.duration == 'number') {
        videoDuration = ffProbeOut.format.duration;
      }
    }

    // FIXME: Delete cwd when done
    // FIXME: write lock on cwd
    const cwdFile = await file.getOwner().getTmpFileSystem().createTmpDir('thumbnail-');
    const cwd = cwdFile.getAbsolutePathOnHost();
    if (cwd == null) {
      throw new Error('cwd is null');
    }

    const args = ['-i', filePath];
    args.unshift('-ss', Math.floor(0.1 * videoDuration).toString(), '-noaccurate_seek');
    args.push('-map', 'v:0', '-vf', `select='eq(pict_type,PICT_TYPE_I)',scale=${width}:-2`, '-vsync', 'vfr');
    args.push('-vframes', sampleSize.toString(), 'frame%01d.png');

    const childProcess = await new ProcessBuilder('ffmpeg', args)
        .errorOnNonZeroExit()
        .withCwd(cwd)
        .runPromised();

    if (childProcess.err) {
      throw childProcess.err;
    }

    let highestDelta = -1;
    let result: Sharp | null = null;
    for (let i = 0; i < sampleSize; ++i) {
      const pic = sharp(Path.join(cwd, `frame${i + 1}.png`));
      const picTrimmedStats = await pic.clone().trim().stats();

      const delta = Color.deltaESquared({r: 0, g: 0, b: 0}, picTrimmedStats.dominant) *
          Color.deltaESquared({r: 255, g: 255, b: 255}, picTrimmedStats.dominant) * (await pic.stats()).entropy;

      if (highestDelta == -1 || delta > highestDelta) {
        highestDelta = delta;
        result = pic;
      }
    }

    return {img: result as Sharp};
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
