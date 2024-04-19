import Fs from 'node:fs';
import Path from 'node:path';
import { getFileNameCollator } from '../../Constants';
import IUserFile from '../../files/IUserFile';
import ProcessBuilder from '../../process_manager/ProcessBuilder';

export default class VideoFrameExtractor {
  static async extractFrames(file: IUserFile): Promise<{ imagePaths: string[], done: () => Promise<void> }> {
    const filePath = await file.getAbsolutePathOnHost();
    if (filePath == null) {
      throw new Error('filePath is null');
    }

    const cwdFile = await file.getOwner().getTmpFileSystem().createTmpDir('video-frames-');
    const cwd = cwdFile.getAbsolutePathOnHost();
    if (cwd == null) {
      throw new Error('cwd is null');
    }

    const ffmpegArgs = [
      '-n',
      '-i', filePath,

      '-map', 'v:0',
      '-vf', `select='eq(pict_type,PICT_TYPE_I)',scale=640:-2`,
      '-vsync', 'vfr',

      'f_%01d.jpg'
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
      done: (): Promise<void> => Fs.promises.rm(cwd, { recursive: true })
    };
  }
}
