import { StringUtils } from '@spraxdev/node-commons';
import Os from 'node:os';
import { singleton } from 'tsyringe';
import { ExtendedVideoAnalysis, VideoStream } from '../../../video/analyser/VideoAnalyser.Types';
import FfmpegProcess from '../../../watch/live_transcode/FfmpegProcess';
import StreamArgumentsBuilder from '../ffmpeg/arguments-builder/StreamArgumentsBuilder';
import VideoStreamArgumentsBuilder from '../ffmpeg/arguments-builder/VideoStreamArgumentsBuilder';
import AutoTranscodeStreamSelector from './AutoTranscodeStreamSelector';

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
}

// TODO: Refactor / clean-up class
@singleton()
export default class LiveTranscodeLauncher {
  constructor(
    private readonly autoStreamSelector: AutoTranscodeStreamSelector,
    private readonly streamArgumentsBuilder: StreamArgumentsBuilder,
  ) {
  }

  async launch(videoFile: string, targetDir: string, startOffsetInSeconds: number, videoAnalysis: ExtendedVideoAnalysis): Promise<LiveTranscodeHandle> {
    const streamsToTranscode = this.autoStreamSelector.selectStreams(videoAnalysis);

    const videoStream = streamsToTranscode.find(stream => stream.codecType == 'video') as VideoStream;

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

      '-hwaccel', 'auto',
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
      `stream_%v/manifest.m3u8`,
    ];

    console.debug(`Started LiveTranscode for ${videoFile} with startOffset=${startOffsetInSeconds}`);

    return {
      process: new FfmpegProcess(ffmpegArgs, {
        stdio: ['ignore', 'ignore', 'pipe'],
        cwd: targetDir,
      }),
      masterHlsFileName: 'master.m3u8',
      mediaDuration: parseFloat(videoStream.duration ?? videoAnalysis.file.duration),
      startOffset: startOffsetInSeconds,
      selectedVideoEncoder: videoEncoder,
      audioNameMap: streamArgs.audioNameMap,
    };
  }

  private determineTargetFps(videoStream: VideoStream): number {
    let avgSourceFps = 30;
    if (StringUtils.isNumeric(videoStream.avgFrameRate)) {
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
