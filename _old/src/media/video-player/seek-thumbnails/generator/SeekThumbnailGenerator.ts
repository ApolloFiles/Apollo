import Fs from 'node:fs';
import Path from 'node:path';
import { singleton } from 'tsyringe';
import { getFileNameCollator } from '../../../../Constants';
import FfmpegProcess from '../../../watch/live_transcode/FfmpegProcess';

export type GeneratedSeekThumbnails = {
  thumbnailFiles: string[],
  frameTimes: number[]
}

@singleton()
export default class SeekThumbnailGenerator {
  public static readonly GRID_SIZE = 9;

  async generate(inputFile: string, targetDir: string): Promise<GeneratedSeekThumbnails> {
    const frameTimes = await this.runFrameExtraction(inputFile, targetDir);
    const frameFiles = await this.collectImageFiles(targetDir);
    frameFiles.sort(getFileNameCollator().compare);

    return {
      thumbnailFiles: frameFiles,
      frameTimes,
    };
  }

  private async runFrameExtraction(inputFile: string, targetDir: string): Promise<number[]> {
    const frameTimes: number[] = [];

    const ffmpegProcess = new FfmpegProcess([
      '-skip_frame', 'nokey',
      '-hwaccel', 'auto',

      '-i', inputFile,
      '-vf', `select=key,scale=240:-2,tile=${SeekThumbnailGenerator.GRID_SIZE}x${SeekThumbnailGenerator.GRID_SIZE}`,
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

  private async collectImageFiles(directoryPath: string): Promise<string[]> {
    return (await Fs.promises.readdir(directoryPath))
      .filter((fileName) => fileName.startsWith('keyframes_'))
      .map((fileName) => Path.join(directoryPath, fileName));
  }
}
