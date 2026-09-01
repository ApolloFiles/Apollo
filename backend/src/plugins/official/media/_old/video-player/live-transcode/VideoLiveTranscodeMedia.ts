import Fs from 'node:fs';
import Path from 'node:path';
import type LocalFile from '../../../../../../files/local/LocalFile.js';
import type { StartPlaybackResponse } from '../legacy-types.js';
import TemporaryDirectory from '../player-session/TemporaryDirectory.js';
import type { LiveTranscodeHandle } from './launcher/LiveTranscodeLauncher.js';

type SubtitleMetadata = {
  subtitles: {
    title: string,
    language: string,
    codecName: string,
    /** Sidecar URI for text-based (soft) subtitles; `null` for image-based subtitles that are burned into the video. */
    uri: string | null,
    /** `true` for image-based subtitles that are burned into the video stream ("hard subs"). */
    isBitmapBased: boolean,
    /** For image-based subtitles: the absolute ffmpeg input stream index used to (de-)select burning; `null` otherwise. */
    streamIndex: number | null,
  }[];
  fonts: { uri: string }[];
}

export default class VideoLiveTranscodeMedia {
  constructor(
    public readonly sourceFile: LocalFile,
    private readonly handle: LiveTranscodeHandle,
    private readonly tmpDir: TemporaryDirectory,
    private readonly subDirName: string,
    public readonly subtitleMetadata: SubtitleMetadata,
    public readonly mediaMetadata: StartPlaybackResponse['mediaMetadata'],
    public readonly audioStreamNames: Map<string, string>,
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

  /** The absolute input stream index of the image-based subtitle currently burned into the video, or `null` if none. */
  get activeBurnedInSubtitleStreamIndex(): number | null {
    return this.handle.burnedInSubtitleStreamIndex;
  }

  get accelId(): string {
    return this.handle.accelId;
  }

  /**
   * Calls back if FFmpeg dies on its own after it started serving – being stopped through {@link destroy} does not count.
   * The transcode may already be dead by the time anyone gets to watch it (subtitle extraction runs alongside the
   * launch and can take longer), so an exit that already happened counts too.
   */
  watchForCrash(onCrash: () => void): void {
    const reportCrash = (): void => {
      if (this.handle.process.crashed()) {
        onCrash();
      }
    };

    if (this.handle.process.hasExited()) {
      reportCrash();
      return;
    }
    this.handle.process.once('exit', reportCrash);
  }

  async destroy(): Promise<void> {
    await this.handle.process.kill();

    await Promise.all([
      Fs.promises.rm(Path.join(this.tmpDir.publicSubDirPath, this.subDirName), { recursive: true, force: true }),
      Fs.promises.rm(Path.join(this.tmpDir.workSubDirPath, this.subDirName), { recursive: true, force: true }),
    ]);
  }
}
