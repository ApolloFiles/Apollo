import { StringUtils } from '@spraxdev/node-commons';
import Os from 'node:os';
import { singleton } from 'tsyringe';
import PlayableDurationUtil, { type DurationRelevantStream } from '../../../../../ffmpeg/probe/PlayableDurationUtil.js';
import type { ExtendedVideoAnalysis, Stream, VideoStream } from '../../../video/analyser/VideoAnalyser.Types.js';
import FfmpegProcess from '../../../watch/live_transcode/FfmpegProcess.js';
import StreamArgumentsBuilder from '../ffmpeg/arguments-builder/StreamArgumentsBuilder.js';
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
  readonly process: FfmpegProcess;
  readonly masterHlsFileName: string;
  readonly mediaDuration: number;
  readonly startOffset: number;
  readonly audioNameMap: Map<string, string>;
  readonly selectedVideoEncoder: string;
  /** The absolute input stream index of the image-based subtitle actually burned into the video, or `null` if none. */
  readonly burnedInSubtitleStreamIndex: number | null;
  /** Whether FFmpeg was asked to pick a hardware decoder (`-hwaccel auto`) for the input file. */
  readonly usedHardwareDecoding: boolean;
}

export type LiveTranscodeOptions = {
  /**
   * Whether FFmpeg may pick a hardware decoder for the input file (`-hwaccel auto`). Defaults to `true`.
   *
   * `-hwaccel auto` picks whatever the system advertises, which can fail at runtime (e.g. on a machine with more than
   * one GPU, or with a driver that cannot read the decoded surfaces back). Disable it to decode in software instead.
   */
  readonly useHardwareDecoding?: boolean;
}

// TODO: Refactor / clean-up class
@singleton()
export default class LiveTranscodeLauncher {
  constructor(
    private readonly autoStreamSelector: AutoTranscodeStreamSelector,
    private readonly streamArgumentsBuilder: StreamArgumentsBuilder,
  ) {
  }

  async launch(videoFile: string, targetDir: string, startOffsetInSeconds: number, videoAnalysis: ExtendedVideoAnalysis, burnInSubtitleStreamIndex?: number | null, options: LiveTranscodeOptions = {}): Promise<LiveTranscodeHandle> {
    const useHardwareDecoding = options.useHardwareDecoding ?? true;
    const streamsToTranscode = this.autoStreamSelector.selectStreams(videoAnalysis, burnInSubtitleStreamIndex);

    const videoStream = streamsToTranscode.find(stream => stream.codecType == 'video') as VideoStream;
    const burnedInSubtitleStream = streamsToTranscode.find(stream => stream.codecType === 'subtitle') ?? null;

    const targetOptions = {
      fps: this.determineTargetFps(videoStream),
      width: this.determineTargetWidth(videoStream),
      segmentDuration: 2,
    };

    const videoEncoder = await this.determineEncoderToUse();

    const streamArgs = await this.streamArgumentsBuilder.build(streamsToTranscode, videoEncoder, targetOptions);
    const ffmpegArgs = [
      '-bitexact',
      '-stats',
      '-stats_period', '1',
      '-n',

      ...(startOffsetInSeconds > 0 ? ['-ss', startOffsetInSeconds.toString()] : []),

      ...(useHardwareDecoding ? ['-hwaccel', 'auto'] : []),
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
      '-master_pl_name', 'master.m3u8',
      '-hls_flags', 'independent_segments',
      '-var_stream_map', streamArgs.varStreamMap.join(' '),

      '-f', 'hls',
      '-shortest',
      `stream_%v/manifest.m3u8`,
    ];

    console.debug(`Started LiveTranscode for ${videoFile} with startOffset=${startOffsetInSeconds} (encoder=${videoEncoder}, hardwareDecoding=${useHardwareDecoding})`);

    return {
      process: new FfmpegProcess(ffmpegArgs, {
        stdio: ['ignore', 'ignore', 'pipe'],
        cwd: targetDir,
      }),
      masterHlsFileName: 'master.m3u8',
      mediaDuration: this.determineOutputTotalDuration(videoFile, streamsToTranscode, videoAnalysis),
      startOffset: startOffsetInSeconds,
      selectedVideoEncoder: videoEncoder,
      audioNameMap: streamArgs.audioNameMap,
      burnedInSubtitleStreamIndex: burnedInSubtitleStream?.index ?? null,
      usedHardwareDecoding: useHardwareDecoding,
    };
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

  private async determineEncoderToUse(): Promise<string> {
    for (const encoder of VideoStreamArgumentsBuilder.SUPPORTED_ENCODERS) {
      if (await this.checkEncoderCanBeUsed(encoder)) {
        return encoder;
      }
    }

    throw new Error(`None of the supported encoders (${VideoStreamArgumentsBuilder.SUPPORTED_ENCODERS.join(', ')}) were detected available on this system`);
  }

  private async checkEncoderCanBeUsed(encoder: string): Promise<boolean> {
    const ffmpegProcess = new FfmpegProcess([
        '-f', 'lavfi',
        '-i', 'nullsrc',
        '-c:v', encoder,
        '-frames:v', '1',
        '-f', 'null',
        '-',
      ],
      {
        stdio: 'ignore',
        cwd: Os.tmpdir(),
        timeout: 10_000,
        killSignal: 'SIGKILL', // If we exceed the generous timeout, something is really wrong -> Force kill
      });

    return new Promise((resolve, reject) => {
      ffmpegProcess.getProcess().on('exit', (code) => resolve(code === 0));
      ffmpegProcess.getProcess().on('error', (error) => reject(error));
    });
  }
}
