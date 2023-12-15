import Crypto from 'node:crypto';
import Path from 'node:path';
import TmpFiles from '../../../TmpFiles';
import FfmpegProcess from '../../watch/live_transcode/FfmpegProcess';

export default class VideoTagWriter {
  static async writeTagsIntoNewFile(filePath: string, fileTags: { [key: string]: string }): Promise<string> {
    const tmpDir = TmpFiles.createTmpDir(60 * 60, 'video-tag-writer');
    const tmpFilePath = Path.join(tmpDir, Crypto.randomUUID() + Path.extname(filePath));

    const ffmpegArgs = [
      '-n',

      '-i', filePath,

      '-map_metadata:g', '-1',
      ...Object.entries(fileTags).flatMap(([key, value]) => ['-metadata:g', `${key}=${value}`]),

      '-c', 'copy',
      '-map', '0',

      tmpFilePath
    ];
    const ffmpegProcess = new FfmpegProcess(ffmpegArgs, {stdio: 'inherit'});
    await ffmpegProcess.waitForSuccessExit();
    return tmpFilePath;
  }
}
