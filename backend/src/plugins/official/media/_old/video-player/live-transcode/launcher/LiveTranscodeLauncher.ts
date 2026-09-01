import { StringUtils } from '@spraxdev/node-commons';
import Fs from 'node:fs';
import Path from 'node:path';
import { singleton } from 'tsyringe';
import type { Accel } from '../../../../../ffmpeg/accel/Accel.js';
import FfmpegJobRunner from '../../../../../ffmpeg/job/FfmpegJobRunner.js';
import PlayableDurationUtil, { type DurationRelevantStream } from '../../../../../ffmpeg/probe/PlayableDurationUtil.js';
import type FfmpegHandle from '../../../../../ffmpeg/process/FfmpegHandle.js';
import type {
  ExtendedVideoAnalysis,
  Stream,
  SubtitleStream,
  VideoStream,
} from '../../../video/analyser/VideoAnalyser.Types.js';
import StreamArgumentsBuilder from '../ffmpeg/arguments-builder/StreamArgumentsBuilder.js';
import VideoStreamArgumentsBuilder, {
  type TargetOptions,
} from '../ffmpeg/arguments-builder/VideoStreamArgumentsBuilder.js';
import AutoTranscodeStreamSelector from './AutoTranscodeStreamSelector.js';

// TODO: Check the subtitle formats listed below (supported by ffmpeg) and add support for them (we might need to convert them into a client-side supported format first)
//   ..S... hdmv_text_subtitle   HDMV Text subtitle
//   D.S... jacosub              JACOsub subtitle
//   D.S... microdvd             MicroDVD subtitle
//   D.S... mpl2                 MPL2 subtitle
//   D.S... pjs                  PJS (Phoenix Japanimation Society) subtitle
//   D.S... realtext             RealText subtitle
//   D.S... sami                 SAMI subtitle
//   ..S... srt                  SubRip subtitle with embedded timing
//   D.S... stl                  Spruce subtitle format
//   DES... subrip               SubRip subtitle (decoders: srt subrip ) (encoders: srt subrip )
//   D.S... subviewer            SubViewer subtitle
//   D.S... subviewer1           SubViewer v1 subtitle
//   D.S... vplayer              VPlayer subtitle

export type LiveTranscodeHandle = {
  /** Still running when this handle is handed over – it only got as far as serving its first segment. */
  readonly process: FfmpegHandle;
  readonly masterHlsFileName: string;
  readonly mediaDuration: number;
  readonly startOffset: number;
  readonly audioNameMap: Map<string, string>;
  /** The absolute input stream index of the image-based subtitle actually burned into the video, or `null` if none. */
  readonly burnedInSubtitleStreamIndex: number | null;
  /** What FFmpeg runs on (see {@link Accel.id}), so a session can steer clear of it after a crash */
  readonly accelId: string;
}

// TODO: Refactor / clean-up class
@singleton()
export default class LiveTranscodeLauncher {
  private static readonly MASTER_HLS_FILE_NAME = 'master.m3u8';
  private static readonly STARTUP_TIMEOUT_IN_MILLIS = 10_000;
  private static readonly MAX_FPS = 60;
  private static readonly DEFAULT_FPS = 30;

  constructor(
    private readonly autoStreamSelector: AutoTranscodeStreamSelector,
    private readonly streamArgumentsBuilder: StreamArgumentsBuilder,
    private readonly videoStreamArgumentsBuilder: VideoStreamArgumentsBuilder,
    private readonly ffmpegJobRunner: FfmpegJobRunner,
  ) {
  }

  /** Resolves once FFmpeg wrote its HLS manifest, leaving the transcode running for the returned handle to own */
  async launch(
    videoFile: string,
    targetDir: string,
    startOffsetInSeconds: number,
    videoAnalysis: ExtendedVideoAnalysis,
    burnInSubtitleStreamIndex?: number | null,
    excludedAccelIds: readonly string[] = [],
  ): Promise<LiveTranscodeHandle> {
    const streamsToTranscode = this.autoStreamSelector.selectStreams(videoAnalysis, burnInSubtitleStreamIndex);

    const videoStream = streamsToTranscode.find(stream => stream.codecType == 'video') as VideoStream;
    const burnedInSubtitleStream = (streamsToTranscode.find(stream => stream.codecType === 'subtitle') as SubtitleStream | undefined) ?? null;

    const targetOptions: TargetOptions = {
      ...LiveTranscodeLauncher.determineTargetFrameRate(videoStream),
      width: this.determineTargetWidth(videoStream),
      segmentDuration: 2,
    };

    // Written while building the arguments and read once the attempt they belong to worked out
    let audioNameMap: Map<string, string> | null = null;

    return this.ffmpegJobRunner.run({
      name: 'live-transcode',
      acceleration: {
        input: { path: videoFile, codecName: videoStream.codecName, pixelFormat: videoStream.pixFmt, width: videoStream.width, height: videoStream.height },
        gpuFilters: true,
        videoEncoder: 'h264',
        excludedAccelIds,
      },
      spawnOptions: { cwd: targetDir },

      buildArgs: (accel) => {
        const videoArgs = this.videoStreamArgumentsBuilder.build(accel, videoStream, burnedInSubtitleStream, targetOptions);
        const streamArgs = this.streamArgumentsBuilder.build(streamsToTranscode, videoArgs);
        audioNameMap = streamArgs.audioNameMap;

        return LiveTranscodeLauncher.buildArgs(accel, videoFile, startOffsetInSeconds, streamArgs.args, streamArgs.varStreamMap, targetOptions);
      },

      awaitOutcome: async (handle, accel) => {
        await this.awaitHlsManifest(handle, targetDir);

        console.debug(`Started LiveTranscode for ${videoFile} with startOffset=${startOffsetInSeconds} (accel=${accel.id})`);
        return {
          process: handle,
          masterHlsFileName: LiveTranscodeLauncher.MASTER_HLS_FILE_NAME,
          mediaDuration: this.determineOutputTotalDuration(videoFile, streamsToTranscode, videoAnalysis),
          startOffset: startOffsetInSeconds,
          audioNameMap: audioNameMap!,
          burnedInSubtitleStreamIndex: burnedInSubtitleStream?.index ?? null,
          accelId: accel.id,
        };
      },

      // FFmpeg runs with '-n' and refuses to overwrite what a failed attempt left behind
      discardOutput: () => this.discardTranscodeOutput(targetDir),
    });
  }

  static buildArgs(accel: Accel, videoFile: string, startOffsetInSeconds: number, streamArgs: string[], varStreamMap: string[], targetOptions: TargetOptions): string[] {
    const seekArgs = startOffsetInSeconds > 0 ? ['-ss', startOffsetInSeconds.toString()] : [];
    return [
      '-bitexact',
      '-n',

      ...accel.inputArgs(),
      ...seekArgs,
      '-i', videoFile,

      '-map_chapters', '-1',

      ...streamArgs,

      '-hls_list_size', '0',
      '-hls_time', targetOptions.segmentDuration.toString(),
      '-hls_init_time', targetOptions.segmentDuration.toString(),
      '-hls_allow_cache', '1',
      '-hls_segment_filename', 'stream_%v/chunk_%d.ts',
      '-hls_enc', '0',
      '-hls_segment_type', 'mpegts',
      '-hls_playlist_type', 'event',
      '-master_pl_name', LiveTranscodeLauncher.MASTER_HLS_FILE_NAME,
      '-hls_flags', 'independent_segments',
      '-var_stream_map', varStreamMap.join(' '),

      '-f', 'hls',
      '-shortest',
      `stream_%v/manifest.m3u8`,
    ];
  }

  /**
   * FFmpeg keeps running after this resolves, so the manifest is what tells a failed start apart from a slow one.
   * Without it the only symptom of a failing transcode is a player waiting for a playlist that never appears.
   * A process that dies before then is caught by the job runner, which fails the attempt the moment it exits.
   */
  private async awaitHlsManifest(handle: FfmpegHandle, targetDir: string): Promise<void> {
    const masterHlsFilePath = Path.join(targetDir, LiveTranscodeLauncher.MASTER_HLS_FILE_NAME);
    const timeoutAt = performance.now() + LiveTranscodeLauncher.STARTUP_TIMEOUT_IN_MILLIS;

    while (!Fs.existsSync(masterHlsFilePath)) {
      if (handle.hasExited()) {
        if (Fs.existsSync(masterHlsFilePath)) {
          return;
        }

        const exitResult = await handle.waitForExit();
        throw new Error(`FFmpeg exited with code ${exitResult.exitCode} (signal=${exitResult.signal}) without creating ${masterHlsFilePath}:\n${handle.getLogProblems()}`);
      }

      // Retryable: a process alive but silent for this long is usually input-side trouble the next candidate repeats,
      // but not always – the first CUDA process after a container start took ~10s of driver warm-up alone
      if (performance.now() >= timeoutAt) {
        throw new Error(`Timeout waiting for FFmpeg to create ${masterHlsFilePath}:\n${handle.getLogTail()}`);
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  /** Removes the output of a failed attempt, but keeps the subtitles extracted alongside it. */
  private async discardTranscodeOutput(targetDir: string): Promise<void> {
    const entries = await Fs.promises.readdir(targetDir);

    await Promise.all(entries
      .filter((entry) => entry !== '_subtitles')
      .map((entry) => Fs.promises.rm(Path.join(targetDir, entry), { recursive: true, force: true })));
  }

  /**
   * The container may claim a longer runtime than it plays (e.g. a subtitle track outliving video and
   * audio), so the duration we announce to the player follows what actually plays – the same rule the
   * library scanner stores in the database.
   */
  private determineOutputTotalDuration(videoFile: string, streamsToTranscode: Stream[], videoAnalysis: ExtendedVideoAnalysis): number {
    const containerDuration = PlayableDurationUtil.parseFiniteFloat(videoAnalysis.file.duration);
    const playableDuration = PlayableDurationUtil.determinePlayableDurationInSec(
      this.toDurationRelevantStreams(videoAnalysis.streams),
      containerDuration,
    );

    this.warnAboutOutputCutShort(videoFile, streamsToTranscode, playableDuration);
    return playableDuration ?? containerDuration ?? 0;
  }

  /**
   * FFmpeg is launched with `-shortest`, so a selected audio stream that ends before
   * the video does cuts the whole output short and the announced duration is too long for those files. The player
   * corrects itself once the transcode wrote its complete playlist, but the file is worth knowing about.
   *
   * TODO: I do not really want to log this but just handle it gracefully. For now, it might be valuable information.
   *       Maybe move it into debug log level in the future
   */
  private warnAboutOutputCutShort(videoFile: string, streamsToTranscode: Stream[], playableDuration: number | null): void {
    const TOLERANCE_IN_SEC = 5;
    if (playableDuration == null) {
      return;
    }

    let shortestAudioSpanInSec: number | null = null;
    for (const stream of this.toDurationRelevantStreams(streamsToTranscode)) {
      if (stream.type !== 'audio') {
        continue;
      }

      const spanInSec = PlayableDurationUtil.determineStreamSpanInSec(stream);
      if (spanInSec != null && (shortestAudioSpanInSec == null || spanInSec < shortestAudioSpanInSec)) {
        shortestAudioSpanInSec = spanInSec;
      }
    }

    if (shortestAudioSpanInSec != null && shortestAudioSpanInSec < (playableDuration - TOLERANCE_IN_SEC)) {
      console.warn(`Shortest selected audio stream of ${videoFile} ends ${Math.round(playableDuration - shortestAudioSpanInSec)}s before the video does – '-shortest' cuts the live-transcode short`);
    }
  }

  private toDurationRelevantStreams(streams: Stream[]): DurationRelevantStream[] {
    const durationRelevantStreams: DurationRelevantStream[] = [];

    for (const stream of streams) {
      if (stream.codecType !== 'video' && stream.codecType !== 'audio') {
        continue;
      }

      durationRelevantStreams.push({
        type: stream.codecType,
        duration: stream.duration,
        durationTs: stream.durationTs,
        timeBase: stream.timeBase,
        tags: stream.tags,
      });
    }

    return durationRelevantStreams;
  }

  /**
   * The source frame rate is kept up to 60 fps – forcing 30 or 60 duplicated every fourth frame of a 24 fps film
   * for nothing. Above that the rate is capped: nothing plays faster anyway, and a bogus `avg_frame_rate` (a damaged
   * MKV claiming 1000/1) would otherwise stretch the GOP, and with it every HLS segment, to thousands of frames.
   */
  static determineTargetFrameRate(videoStream: VideoStream): Pick<TargetOptions, 'fps' | 'capFrameRate'> {
    const sourceFps = LiveTranscodeLauncher.parseSourceFps(videoStream.avgFrameRate) ?? LiveTranscodeLauncher.DEFAULT_FPS;
    if (sourceFps > LiveTranscodeLauncher.MAX_FPS) {
      return { fps: LiveTranscodeLauncher.MAX_FPS, capFrameRate: true };
    }
    return { fps: sourceFps, capFrameRate: false };
  }

  private static parseSourceFps(avgFrameRate: string): number | null {
    let fps: number;
    if (StringUtils.default.isNumeric(avgFrameRate)) {
      fps = parseFloat(avgFrameRate);
    } else if (avgFrameRate.includes('/')) {
      const [num, den] = avgFrameRate.split('/');
      fps = parseInt(num, 10) / parseInt(den, 10);
    } else {
      return null;
    }
    return Number.isFinite(fps) && fps > 0 ? fps : null;
  }

  private determineTargetWidth(videoStream: VideoStream): number {
    const targetWidth = 1920;
    if (targetWidth > videoStream.width) {
      return videoStream.width;
    }
    return targetWidth;
  }
}
