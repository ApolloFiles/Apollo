import Fs from 'node:fs';
import Path from 'node:path';
import { singleton } from 'tsyringe';
import LiveTranscodeLauncher, { type LiveTranscodeHandle } from './launcher/LiveTranscodeLauncher.js';
import type TemporaryDirectory from '../player-session/TemporaryDirectory.js';
import type LocalFile from '../../../../../../files/local/LocalFile.js';
import type { StartPlaybackResponse } from '../legacy-types.js';
import VideoLiveTranscodeMedia from './VideoLiveTranscodeMedia.js';
import TextBasedSubtitleExtractor from '../../watch/live_transcode/extractor/TextBasedSubtitleExtractor.js';
import VideoAnalyser from '../../video/analyser/VideoAnalyser.js';
import type { ExtendedVideoAnalysis } from '../../video/analyser/VideoAnalyser.Types.js';
import FontExtractor, { type ExtractedFont } from '../../watch/live_transcode/extractor/FontExtractor.js';
import ImageBasedSubtitleHelper from './ffmpeg/ImageBasedSubtitleHelper.js';

@singleton()
export default class VideoLiveTranscodeMediaFactory {
  private static readonly TRANSCODE_STARTUP_TIMEOUT_IN_MILLIS = 10_000;

  constructor(
    private readonly liveTranscodeLauncher: LiveTranscodeLauncher,
  ) {
  }

  async create(tmpDir: TemporaryDirectory, file: LocalFile, startOffsetInSeconds: number, mediaMetadata: StartPlaybackResponse['mediaMetadata'], burnInSubtitleStreamIndex?: number | null): Promise<VideoLiveTranscodeMedia> {
    const [targetPublicDir, targetWorkDir, randomDirName] = await this.createTargetDirs(tmpDir);
    const videoFilePath = await this.createAnonymizedFileLink(file, targetWorkDir);

    const videoAnalysis = await VideoAnalyser.analyze(videoFilePath, true);

    const [launchOutcome, subtitleOutcome] = await Promise.allSettled([
      this.liveTranscodeLauncher.launch(videoFilePath, targetPublicDir, startOffsetInSeconds, videoAnalysis, burnInSubtitleStreamIndex),
      (async () => {
        const textBasedSubtitlesDir = Path.join(targetPublicDir, '_subtitles'); // TODO: maybe in einen anderen Ordner für einfachere reusability zwischen transcode-restarts?
        const textBasedSubtitles = await TextBasedSubtitleExtractor.extract(videoFilePath, videoAnalysis, textBasedSubtitlesDir);

        let subtitleFonts: ExtractedFont[] = [];
        if (textBasedSubtitles.length > 0) {
          const fontsDir = Path.join(textBasedSubtitlesDir, 'fonts');

          try {
            subtitleFonts = await FontExtractor.extract(videoFilePath, videoAnalysis, fontsDir);
          } catch (err) {
            console.error('Failed to extract fonts from video', err);
          }
        }

        return { textBasedSubtitles, subtitleFonts };
      })(),
    ]);

    // A failed launch cleans up after itself, a started one has to be stopped here – it keeps transcoding into a
    // directory nobody is going to read, and this handle is the only one there is
    if (launchOutcome.status === 'rejected') {
      throw launchOutcome.reason;
    }
    if (subtitleOutcome.status === 'rejected') {
      await launchOutcome.value.process.kill().catch((err) => console.error('Failed to stop the live transcode of a session that never started', err));
      throw subtitleOutcome.reason;
    }

    const transcodeHandle = launchOutcome.value;
    const subtitleResult = subtitleOutcome.value;

    // TODO: Check if we want to provide these metrics and how:
    // transcodeHandle.process.on('metrics', (metrics) => {
    //   session._broadcast<BackendDebugInfoMessage>({
    //     type: 'backendDebugInfo',
    //     data: {
    //       videoEncoder: transcode.videoEncoder,
    //       ...metrics,
    //     },
    //   });
    // });

    // TODO: Have an API-Endpoint for the player-session that provides the seek-thumbnails (with session permission check essentially)
    // TODO: Maybe an endpoint that provides subtitles too? Could be used by the player for non-live-transcode too
    //       Problem: What about image-based subtitles that are only available during live-transcode? The endpoint
    //         maybe should provide all the 'type' info so the player can switch from native to live-transcode (could be nicely cached again and makes reusing it easier :3)
    return new VideoLiveTranscodeMedia(
      file,
      transcodeHandle,
      tmpDir,
      randomDirName,
      {
        subtitles: [
          ...subtitleResult.textBasedSubtitles.map((subtitle) => {
            return {
              title: subtitle.title,
              language: subtitle.language,
              codecName: subtitle.codecName,
              uri: `${randomDirName}/_subtitles/${encodeURIComponent(subtitle.fileName)}`,
              isBitmapBased: false,
              streamIndex: null,
            };
          }),
          ...ImageBasedSubtitleHelper.listSupportedImageBasedSubtitleStreams(videoAnalysis).map((subtitle) => {
            return {
              title: subtitle.title,
              language: subtitle.language,
              codecName: subtitle.codecName,
              uri: null,
              isBitmapBased: true,
              streamIndex: subtitle.streamIndex,
            };
          }),
        ],
        fonts: subtitleResult.subtitleFonts.map((font) => {
          return {
            uri: `${randomDirName}/_subtitles/fonts/${encodeURIComponent(font.fileName)}`,
          };
        }),
      },
      mediaMetadata,
      transcodeHandle.audioNameMap,
    );
  }

  private async createAnonymizedFileLink(file: LocalFile, targetDir: string): Promise<string> {
    const targetFilePath = Path.join(targetDir, this.generateRandomFileName(file.getFileName()));

    await Fs.promises.symlink(file.getAbsolutePathOnHost(), targetFilePath);
    return targetFilePath;
  }

  private async createTargetDirs(tmpDir: TemporaryDirectory): Promise<[publicDir: string, workDir: string, randomDirName: string]> {
    const randomDirName = this.generateRandomFileName();
    const publicDir = Path.join(tmpDir.publicSubDirPath, randomDirName);
    const workDir = Path.join(tmpDir.workSubDirPath, randomDirName);

    await Promise.all([
      Fs.promises.mkdir(workDir, { recursive: true }),
      Fs.promises.mkdir(publicDir, { recursive: true }),
    ]);

    return [publicDir, workDir, randomDirName];
  }

  private generateRandomFileName(originalFileName?: string): string {
    let randomName = Math.random().toString(36).substring(2);
    if (originalFileName != null) {
      randomName += Path.extname(originalFileName);
    }
    return randomName;
  }
}
