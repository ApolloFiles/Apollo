import Fs from 'node:fs';
import Path from 'node:path';
import { getFileNameCollator } from '../../Constants';
import ProcessBuilder from '../../process_manager/ProcessBuilder';
import LocalFile from '../../user/files/local/LocalFile';

export default class VideoFrameExtractor {
  static async extractFrames(file: LocalFile): Promise<{ imagePaths: string[], done: () => Promise<void> }> {
    const cwdFile = await file.fileSystem.owner.getTmpFileSystem().createTmpDir('video-frames-');
    const cwd = cwdFile.getAbsolutePathOnHost();

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
      .sort(getFileNameCollator().compare);
    return {
      imagePaths,
      done: (): Promise<void> => Fs.promises.rm(cwd, { recursive: true }),
    };
  }
}
