import Crypto from 'node:crypto';
import Fs from 'node:fs';
import Path from 'node:path';
import { singleton } from 'tsyringe';
import type FileSystemProvider from '../../../../../files/FileSystemProvider.js';
import LocalFile from '../../../../../files/local/LocalFile.js';
import ProcessBuilder from '../ProcessBuilder.js';

@singleton()
export default class VideoFrameExtractor {
  constructor(
    private readonly fileSystemProvider: FileSystemProvider,
  ) {
  }

  async extractFrames(file: LocalFile): Promise<{ imagePaths: string[], done: () => Promise<void> }> {
    const userFileSystems = await this.fileSystemProvider.provideForUser(file.fileSystem.owner);
    const cwdFile = await userFileSystems.tmp.getFile(`/video-frames-${Crypto.randomUUID()}/`);
    if (!(cwdFile instanceof LocalFile)) {
      throw new Error('Temporary directory is not a LocalFile.');
    }

    const cwd = cwdFile.getAbsolutePathOnHost();
    await Fs.promises.mkdir(cwd, { recursive: true });

    const ffmpegArgs = [
      '-n',
      '-i', file.getAbsolutePathOnHost(),

      '-map', 'v:0',
      '-vf', `select='eq(pict_type,PICT_TYPE_I)',scale=640:-2`,
      '-vsync', 'vfr',

      'f_%01d.jpg',
    ];

    const childProcess = await new ProcessBuilder('ffmpeg', ffmpegArgs)
      .errorOnNonZeroExit()
      .withCwd(cwd)
      .runPromised();
    if (childProcess.err) {
      throw childProcess.err;
    }

    const imagePaths = (await Fs.promises.readdir(cwd))
      .map((fileName) => Path.join(cwd, fileName))
      .sort(new Intl.Collator('en', { numeric: true, sensitivity: 'accent' }).compare);
    return {
      imagePaths,
      done: (): Promise<void> => Fs.promises.rm(cwd, { recursive: true }),
    };
  }
}
