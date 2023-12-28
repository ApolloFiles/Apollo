import Crypto from 'node:crypto';
import Path from 'node:path';
import TmpFiles from '../../../TmpFiles';
import FfmpegProcess from '../../watch/live_transcode/FfmpegProcess';

type MetaTag = {
  key: string;
  value: string;
}

export default class VideoTagWriter {
  static async writeTagsIntoNewFile(filePath: string, fileTags: MetaTag, streamTags: { [streamIndex: number]: MetaTag }, streamDispositions: { [streamIndex:number]: { [key: string]: 0 | 1 } }): Promise<string> {
    const tmpDir = TmpFiles.createTmpDir(60 * 60, 'video-tag-writer');
    const tmpFilePath = Path.join(tmpDir, Crypto.randomUUID() + Path.extname(filePath));

    const ffmpegArgs = [
      '-n',

      '-i', filePath,

      '-map_metadata:g', '-1',
      ...Object.entries(fileTags).flatMap(([key, value]) => ['-metadata:g', `${key}=${value}`])
    ];

    for (const streamIndex in streamTags) {
      ffmpegArgs.push(`-map_metadata:s:${streamIndex}`, '-1');

      for (const [key, value] of Object.entries(streamTags[streamIndex])) {
        ffmpegArgs.push(`-metadata:s:${streamIndex}`, `${key}=${value}`);
      }
    }

    for (const streamIndex in streamDispositions) {
      const enabledDispositions = Object.entries(streamDispositions[streamIndex])
        .filter(([_, value]) => value === 1)
        .map(([key]) => key)
        .join('+');

      ffmpegArgs.push(`-disposition:${streamIndex}`, enabledDispositions || '0');
    }

    ffmpegArgs.push(
      '-c', 'copy',
      '-map', '0',

      tmpFilePath
    );

    const ffmpegProcess = new FfmpegProcess(ffmpegArgs, { stdio: 'inherit' });
    await ffmpegProcess.waitForSuccessExit();
    return tmpFilePath;
  }
}
