import Fs from 'node:fs';
import Path from 'node:path';
import sharp from 'sharp';
import { getFileNameCollator } from '../../Constants';
import ProcessBuilder from '../../process_manager/ProcessBuilder';
import Utils from '../../Utils';

export default class WebVttThumbnailGenerator {
  private static readonly SECONDS_BETWEEN_FRAMES = 4;

  async generate(videoFilePath: string, targetDir: string): Promise<{ vttFileName: string }> {
    await Fs.promises.mkdir(Path.join(targetDir, 'frames'), { recursive: true });

    const inputFileRelativePath = `input${Path.extname(videoFilePath)}`;

    await Utils.createHardLinkAndFallbackToSymbolicLinkIfCrossDevice(videoFilePath, Path.join(targetDir, inputFileRelativePath));

    const childProcess = await new ProcessBuilder('ffmpeg',
      [
        '-hwaccel', 'auto',
        '-bitexact',
        '-n',
        '-i', inputFileRelativePath,

        '-bt', '20',
        '-vf', `fps=1/${WebVttThumbnailGenerator.SECONDS_BETWEEN_FRAMES},scale=240:-1`,

        '-f', 'image2',
        'frames/%d.png'
      ])
      .errorOnNonZeroExit()
      .withCwd(targetDir)
      .runPromised();
    if (childProcess.err) {
      throw childProcess.err;
    }

    const frameFiles = (await Fs.promises.readdir(Path.join(targetDir, 'frames'))).map((fileName) => Path.join('frames', fileName));
    frameFiles.sort(getFileNameCollator().compare);

    const chunkSize = 10;
    for (let i = 0; i < frameFiles.length; i += chunkSize) {
      const chunk = frameFiles.slice(i, i + chunkSize);
      await this.mergeFramesIntoChunkImage(chunk, `chunk_${i / chunkSize}.png`, targetDir);
    }

    const frameMetaData = await sharp(Path.join(targetDir, 'frames/1.png')).metadata();
    if (frameMetaData.width == null || frameMetaData.height == null) {
      throw new Error('Failed to get frame dimensions');
    }

    let webVttContent = 'WEBVTT\n\n';
    for (let i = 0; i < frameFiles.length; i += chunkSize) {
      const chunk = frameFiles.slice(i, i + chunkSize);
      const chunkFileName = `chunk_${i / chunkSize}.png`;

      for (let j = 0; j < chunk.length; ++j) {
        const frameStart = (i * WebVttThumbnailGenerator.SECONDS_BETWEEN_FRAMES) + (j * WebVttThumbnailGenerator.SECONDS_BETWEEN_FRAMES);

        webVttContent += `${this.toWebVttTime(frameStart)} --> ${this.toWebVttTime(frameStart + WebVttThumbnailGenerator.SECONDS_BETWEEN_FRAMES)}\n`;
        webVttContent += `${chunkFileName}#xywh=${frameMetaData.width * j},0,${frameMetaData.width},${frameMetaData.height}\n\n`;
      }
    }
    await Fs.promises.writeFile(Path.join(targetDir, 'thumbnails.vtt'), webVttContent);

    await Fs.promises.rm(Path.join(targetDir, 'frames'), { recursive: true });

    return {
      vttFileName: 'thumbnails.vtt'
    };
  }

  private async mergeFramesIntoChunkImage(imageFiles: string[], chunkFilePath: string, cwd: string): Promise<void> {
    const args = [
      '-bitexact',
      '-n'
    ];

    for (const imagePath of imageFiles) {
      args.push('-i', imagePath);
    }

    if (imageFiles.length > 1) {
      args.push('-filter_complex', `hstack=inputs=${imageFiles.length}`);
    }

    args.push(
      '-f', 'image2',
      chunkFilePath
    );

    const childProcess = await new ProcessBuilder('ffmpeg', args)
      .withCwd(cwd)
      .runPromised();
    if (childProcess.err) {
      throw childProcess.err;
    }
  }

  private toWebVttTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const seconds2 = Math.floor(seconds % 60);

    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds2.toString().padStart(2, '0')}.000`;
  };
}
