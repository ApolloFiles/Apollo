import Fs from 'node:fs';
import Path from 'node:path';
import sharp from 'sharp';
import { getFileNameCollator } from '../../Constants';
import FfmpegProcess from './live_transcode/FfmpegProcess';

export default class WebVttKeyframeGenerator {
  public static readonly VTT_FILE_NAME = 'keyframes.vtt';
  private static readonly GRID_SIZE = 8;

  async generate(inputFile: string, targetDir: string): Promise<void> {
    const frameTimes = await this.runFrameExtraction(inputFile, targetDir);

    const frameFiles = (await Fs.promises.readdir(targetDir))
      .filter((fileName) => fileName.startsWith('keyframes_'))
      .map((fileName) => Path.join(targetDir, fileName));
    frameFiles.sort(getFileNameCollator().compare);

    const vttFileStream = await Fs.promises.open(Path.join(targetDir, WebVttKeyframeGenerator.VTT_FILE_NAME), 'w');
    try {
      await this.generateVttFile(vttFileStream, frameFiles, frameTimes);
    } finally {
      await vttFileStream.close();
    }

    return {} as any;
  }

  private async runFrameExtraction(inputFile: string, targetDir: string): Promise<number[]> {
    const frameTimes: number[] = [];

    const ffmpegProcess = new FfmpegProcess([
      '-skip_frame', 'nokey',
      '-hwaccel', 'auto',

      '-i', inputFile,
      '-vf', `select=key,scale=240:-2,tile=${WebVttKeyframeGenerator.GRID_SIZE}x${WebVttKeyframeGenerator.GRID_SIZE}`,
      '-an',  // blocks all audio streams
      '-vsync', '0',  // prevent ffmpeg from duplicating each output frame to accommodate the originally detected frame rate
      'keyframes_%03d.jpg',

      '-loglevel', 'debug',
    ], {
      cwd: targetDir,
      stdio: ['ignore', 'ignore', 'pipe'],
    });

    const bufferedChunks: Buffer[] = [];
    ffmpegProcess.getProcess().stderr!.on('data', (chunk) => {
      if (!Buffer.isBuffer(chunk)) {
        throw new Error('Expected chunk to be a Buffer');
      }

      while (true) {
        const indexOfNewline = chunk.indexOf('\n');
        if (indexOfNewline === -1) {
          break;
        }

        const line = Buffer.concat([...bufferedChunks, chunk.subarray(0, indexOfNewline)]).toString('utf-8').trim();
        bufferedChunks.length = 0;
        chunk = chunk.subarray(indexOfNewline + 1);

        if (line.startsWith('[Parsed_select_0 @ ') && line.includes(' -> select:1.0')) {
          const timeIndex = line.indexOf('t:');
          const timeValue = line.substring(timeIndex + 2, line.indexOf(' ', timeIndex + 2));

          const parseFrameTime = parseFloat(timeValue);
          if (!Number.isFinite(parseFrameTime)) {
            console.warn('Failed to parse frame time as float:', timeValue);
            continue;
          }
          frameTimes.push(parseFrameTime);
        }
      }

      bufferedChunks.push(chunk);
    });

    await ffmpegProcess.waitForSuccessExit();
    return frameTimes;
  }

  private async generateVttFile(fileStream: Fs.promises.FileHandle, frameFiles: string[], frameTimes: number[]): Promise<void> {
    const frameDimensions = await this.determineFrameDimensions(frameFiles[0]);

    await fileStream.write('WEBVTT\n\n');

    let processedFrames = 0;
    for (const frameFile of frameFiles) {
      const framesInThisFile = Math.min(WebVttKeyframeGenerator.GRID_SIZE * WebVttKeyframeGenerator.GRID_SIZE, frameTimes.length - processedFrames);

      for (let i = 0; i < framesInThisFile; i++) {
        const x = (i % WebVttKeyframeGenerator.GRID_SIZE) * frameDimensions.width;
        const y = Math.floor(i / WebVttKeyframeGenerator.GRID_SIZE) * frameDimensions.height;

        const startTime = frameTimes[processedFrames + i];
        const endTime = frameTimes[processedFrames + i + 1] || startTime + 1; // If there's no next frame, assume 1 second duration

        const vttLine = `${this.toWebVttTime(startTime)} --> ${this.toWebVttTime(endTime)}\n`;
        const vttSprite = `${Path.basename(frameFile)}#xywh=${x},${y},${frameDimensions.width},${frameDimensions.height}\n\n`;

        await fileStream.write(vttLine + vttSprite);
      }

      processedFrames += framesInThisFile;
    }
  }

  private async determineFrameDimensions(gridFile: string): Promise<{ width: number, height: number }> {
    const imageMetadata = await sharp(gridFile).metadata();
    if (imageMetadata.width == null || imageMetadata.height == null) {
      throw new Error('Failed to get frame dimensions');
    }

    return {
      width: imageMetadata.width / WebVttKeyframeGenerator.GRID_SIZE,
      height: imageMetadata.height / WebVttKeyframeGenerator.GRID_SIZE,
    };
  }

  private toWebVttTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const seconds2 = Math.floor(seconds % 60);

    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds2.toString().padStart(2, '0')}.000`;
  };
}
