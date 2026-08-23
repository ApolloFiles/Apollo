import { StringUtils } from '@spraxdev/node-commons';
import Fs from 'node:fs';
import Path from 'node:path';
import { singleton } from 'tsyringe';
import type { FfmpegAccelerationProfile } from '../../../../../ffmpeg/accel/FfmpegAccelerationPlanner.js';
import FfmpegJobRunner from '../../../../../ffmpeg/job/FfmpegJobRunner.js';
import UnretryableFfmpegJobError from '../../../../../ffmpeg/job/UnretryableFfmpegJobError.js';
import type FfmpegHandle from '../../../../../ffmpeg/process/FfmpegHandle.js';
import PlayableDurationUtil, { type DurationRelevantStream } from '../../../../../ffmpeg/probe/PlayableDurationUtil.js';
import type { ExtendedVideoAnalysis, Stream, VideoStream } from '../../../video/analyser/VideoAnalyser.Types.js';
import StreamArgumentsBuilder, { type StreamArgumentsResult } from '../ffmpeg/arguments-builder/StreamArgumentsBuilder.js';
import VideoStreamArgumentsBuilder from '../ffmpeg/arguments-builder/VideoStreamArgumentsBuilder.js';
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
  readonly selectedVideoEncoder: string;
  /** The absolute input stream index of the image-based subtitle actually burned into the video, or `null` if none. */
  readonly burnedInSubtitleStreamIndex: number | null;
  /** The decode acceleration FFmpeg was told to use, or `null` if it decodes in software. */
  readonly usedDecodeAcceleration: string | null;
}

// TODO: Refactor / clean-up class
@singleton()
export default class LiveTranscodeLauncher {
  private static readonly MASTER_HLS_FILE_NAME = 'master.m3u8';
  private static readonly STARTUP_TIMEOUT_IN_MILLIS = 10_000;

  constructor(
    private readonly autoStreamSelector: AutoTranscodeStreamSelector,
    private readonly streamArgumentsBuilder: StreamArgumentsBuilder,
    private readonly ffmpegJobRunner: FfmpegJobRunner,
  ) {
  }

  /** Resolves once FFmpeg wrote its HLS manifest, leaving the transcode running for the returned handle to own. */
  async launch(videoFile: string, targetDir: string, startOffsetInSeconds: number, videoAnalysis: ExtendedVideoAnalysis, burnInSubtitleStreamIndex?: number | null): Promise<LiveTranscodeHandle> {
    const streamsToTranscode = this.autoStreamSelector.selectStreams(videoAnalysis, burnInSubtitleStreamIndex);

    const videoStream = streamsToTranscode.find(stream => stream.codecType == 'video') as VideoStream;
    const burnedInSubtitleStream = streamsToTranscode.find(stream => stream.codecType === 'subtitle') ?? null;

    const targetOptions = {
      fps: this.determineTargetFps(videoStream),
      width: this.determineTargetWidth(videoStream),
      segmentDuration: 2,
    };

    // Written while building the arguments and read once the attempt they belong to worked out
    let streamArgs: StreamArgumentsResult | null = null;

    return this.ffmpegJobRunner.run({
      name: 'live-transcode',
      acceleration: {
        mayUseHardwareDecoding: true,
        videoEncoderCandidates: VideoStreamArgumentsBuilder.SUPPORTED_ENCODERS,
      },
      spawnOptions: { cwd: targetDir },

      buildArgs: async (profile) => {
        streamArgs = await this.streamArgumentsBuilder.build(streamsToTranscode, LiveTranscodeLauncher.requireVideoEncoder(profile), targetOptions);

        return [
          '-bitexact',
          '-n',

          ...(startOffsetInSeconds > 0 ? ['-ss', startOffsetInSeconds.toString()] : []),

          ...(profile.decodeAcceleration != null ? ['-hwaccel', profile.decodeAcceleration] : []),
          '-i', videoFile,

          '-map_chapters', '-1',

          ...streamArgs.args,

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
          '-var_stream_map', streamArgs.varStreamMap.join(' '),

          '-f', 'hls',
          '-shortest',
          `stream_%v/manifest.m3u8`,
        ];
      },

      awaitOutcome: async (handle, profile) => {
        await this.awaitHlsManifest(handle, targetDir);

        console.debug(`Started LiveTranscode for ${videoFile} with startOffset=${startOffsetInSeconds} (profile=${profile.id})`);
        return {
          process: handle,
          masterHlsFileName: LiveTranscodeLauncher.MASTER_HLS_FILE_NAME,
          mediaDuration: this.determineOutputTotalDuration(videoFile, streamsToTranscode, videoAnalysis),
          startOffset: startOffsetInSeconds,
          selectedVideoEncoder: LiveTranscodeLauncher.requireVideoEncoder(profile),
          audioNameMap: streamArgs!.audioNameMap,
          burnedInSubtitleStreamIndex: burnedInSubtitleStream?.index ?? null,
          usedDecodeAcceleration: profile.decodeAcceleration,
        };
      },

      // FFmpeg runs with '-n' and refuses to overwrite what a failed attempt left behind
      discardOutput: () => this.discardTranscodeOutput(targetDir),
    });
  }

  /**
   * FFmpeg keeps running after this resolves, so the manifest is what tells a failed start apart from a slow one.
   * Without it the only symptom of a failing transcode is a player waiting for a playlist that never appears.
   */
  private async awaitHlsManifest(handle: FfmpegHandle, targetDir: string): Promise<void> {
    const masterHlsFilePath = Path.join(targetDir, LiveTranscodeLauncher.MASTER_HLS_FILE_NAME);
    const timeoutAt = performance.now() + LiveTranscodeLauncher.STARTUP_TIMEOUT_IN_MILLIS;

    while (!Fs.existsSync(masterHlsFilePath)) {
      // The manifest might have been written just before the process exited
      if (handle.hasExited()) {
        if (Fs.existsSync(masterHlsFilePath)) {
          return;
        }

        // Settled already, and it rethrows a process that never started rather than inventing an exit code for it
        const exitResult = await handle.waitForExit();
        throw new Error(`FFmpeg exited with code ${exitResult.exitCode} (signal=${exitResult.signal}) without creating ${masterHlsFilePath}:\n${handle.getLogProblems()}`);
      }

      // Every profile waiting its own timeout out would keep a viewer looking at a spinner for as many times ten
      // seconds as the machine has hardware. FFmpeg that fails on hardware says so and exits, it does not hang.
      if (performance.now() >= timeoutAt) {
        throw new UnretryableFfmpegJobError(`Timeout waiting for FFmpeg to create ${masterHlsFilePath}:\n${handle.getLogTail()}`);
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

  private static requireVideoEncoder(profile: FfmpegAccelerationProfile): string {
    if (profile.videoEncoder == null) {
      throw new Error(`The '${profile.id}' acceleration profile names no video encoder, but a live transcode has to encode video`);
    }
    return profile.videoEncoder;
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
   * FFmpeg is launched with `-shortest`, so a selected audio stream that ends before the video does
   * cuts the whole output short and the announced duration is too long for those files. The player
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

  private determineTargetFps(videoStream: VideoStream): number {
    let avgSourceFps = 30;
    if (StringUtils.default.isNumeric(videoStream.avgFrameRate)) {
      avgSourceFps = parseInt(videoStream.avgFrameRate, 10);
    } else if (videoStream.avgFrameRate.includes('/')) {
      const [num, den] = videoStream.avgFrameRate.split('/');
      avgSourceFps = parseInt(num, 10) / parseInt(den, 10);
    }

    return avgSourceFps >= 60 ? 60 : 30;
  }

  private determineTargetWidth(videoStream: VideoStream): number {
    const targetWidth = 1920;
    if (targetWidth > videoStream.width) {
      return videoStream.width;
    }
    return targetWidth;
  }
}
