import Fs from 'node:fs';
import Path from 'node:path';
import LocalFile from '../../../user/files/local/LocalFile';
import TemporaryDirectory from '../player-session/TemporaryDirectory';
import { LiveTranscodeHandle } from './launcher/LiveTranscodeLauncher';

type SubtitleMetadata = {
  subtitles: {
    title: string,
    language: string,
    codecName: string,
    uri: string,
  }[];
  fonts: { uri: string }[];
}

export default class VideoLiveTranscodeMedia {
  constructor(
    public readonly sourceFile: LocalFile,
    private readonly handle: LiveTranscodeHandle,
    private readonly tmpDir: TemporaryDirectory,
    private readonly subDirName: string,
    private readonly subtitleMetadata: SubtitleMetadata,
  ) {
  }

  get relativePublicPathToHlsManifest(): string {
    return `${this.subDirName}/${this.handle.masterHlsFileName}`;
  }

  get totalDurationInSeconds(): number {
    return this.handle.mediaDuration;
  }

  get startOffset(): number {
    return this.handle.startOffset;
  }

  async destroy(): Promise<void> {
    await this.handle.process.terminate();

    await Promise.all([
      Fs.promises.rm(Path.join(this.tmpDir.publicSubDirPath, this.subDirName), { recursive: true, force: true }),
      Fs.promises.rm(Path.join(this.tmpDir.workSubDirPath, this.subDirName), { recursive: true, force: true }),
    ]);
  }
}
