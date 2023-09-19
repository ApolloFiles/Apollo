import {StringUtils} from '@spraxdev/node-commons';
import Fs from 'node:fs';
import Os from 'node:os';
import VideoAnalyser from '../../video/analyser/VideoAnalyser';
import {ExtendedVideoAnalysis, Stream, VideoStream} from '../../video/analyser/VideoAnalyser.Types';
import StreamArgsBuilder from './args_builder/StreamArgsBuilder';
import VideoEncoderArgsBuilder, {TargetOptions} from './args_builder/VideoEncoderArgsBuilder';
import TextBasedSubtitleExtractor from './extractor/TextBasedSubtitleExtractor';
import FfmpegProcess from './FfmpegProcess';

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

export interface LiveTranscodeResult {
  readonly process: FfmpegProcess;
  readonly mediaDuration: number;
  readonly videoEncoder: string;
}

export default class LiveTranscode {
  static async startLiveTranscode(videoFile: string, targetDir: string): Promise<LiveTranscodeResult> {
    await Fs.promises.mkdir(targetDir, {recursive: true});

    const videoAnalysis = await VideoAnalyser.analyze(videoFile, true);
    const streamsToTranscode = this.autoDetectStreamsToTranscode(videoAnalysis);

    const videoStream = streamsToTranscode.find(stream => stream.codecType == 'video') as VideoStream;

    const targetOptions: TargetOptions = {
      fps: this.determineTargetFps(videoStream),
      width: this.determineTargetWidth(videoStream),
      segmentDuration: 2
    };

    const videoEncoder = await this.determineEncoderToUse();
    const streamArgs = await StreamArgsBuilder.buildArgsForStreams(streamsToTranscode, videoEncoder, targetOptions);

    const ffmpegArgs = [
      '-bitexact',
      '-stats',
      '-stats_period', '1',
      '-n',

      '-hwaccel', 'auto',
      '-i', videoFile,

      '-map_chapters', '-1',
      '-map_metadata', '-1',

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
      `stream_%v/manifest.m3u8`
    ];

    return {
      process: new FfmpegProcess(ffmpegArgs, {
        stdio: ['ignore', 'ignore', 'pipe'],
        cwd: targetDir
      }),
      mediaDuration: parseFloat(videoStream.duration ?? videoAnalysis.file.duration),
      videoEncoder
    };
  }

  private static autoDetectStreamsToTranscode(videoAnalysis: ExtendedVideoAnalysis): Stream[] {
    const firstVideoStream = videoAnalysis.streams.find(stream => stream.codecType == 'video');
    if (firstVideoStream == null) {
      throw new Error('No video stream found');
    }

    const audioStreams = videoAnalysis.streams.filter(stream => stream.codecType == 'audio');
    audioStreams.sort((a, b) => LiveTranscode.compareStreamsByLanguage(a, b, ['jpn', 'eng', 'deu']));

    const subtitleStreams = videoAnalysis.streams.filter(stream => stream.codecType == 'subtitle');
    subtitleStreams.sort((a, b) => LiveTranscode.compareStreamsByLanguage(a, b, ['deu', 'eng']));

    const shouldTranscodeImageBasedSubtitles = subtitleStreams.length > 0 && !this.includesTextBasedSubtitles(videoAnalysis.streams);

    const streamsToTranscode = [firstVideoStream];
    if (audioStreams.length > 0) {
      streamsToTranscode.push(audioStreams[0]);

      if (shouldTranscodeImageBasedSubtitles && (audioStreams[0].tags.language == 'jpn' || audioStreams[0].tags.language == 'und')) {
        streamsToTranscode.push(subtitleStreams[0]);
      }
    } else if (shouldTranscodeImageBasedSubtitles) {
      streamsToTranscode.push(subtitleStreams[0]);
    }

    return streamsToTranscode;
  }

  private static async determineEncoderToUse(): Promise<string> {
    for (const encoder of VideoEncoderArgsBuilder.SUPPORTED_ENCODERS) {
      if (await this.checkEncoderCanBeUsed(encoder)) {
        return encoder;
      }
    }

    throw new Error(`None of the supported encoders (${VideoEncoderArgsBuilder.SUPPORTED_ENCODERS.join(', ')}) were detected available on this system`);
  }

  private static determineTargetFps(videoStream: VideoStream): number {
    let avgSourceFps = 30;
    if (StringUtils.isNumeric(videoStream.avgFrameRate)) {
      avgSourceFps = parseInt(videoStream.avgFrameRate, 10);
    } else if (videoStream.avgFrameRate.includes('/')) {
      const [num, den] = videoStream.avgFrameRate.split('/');
      avgSourceFps = parseInt(num, 10) / parseInt(den, 10);
    }

    return avgSourceFps >= 60 ? 60 : 30;
  }

  private static determineTargetWidth(videoStream: VideoStream): number {
    const targetWidth = 1920;
    if (targetWidth > videoStream.width) {
      return videoStream.width;
    }
    return targetWidth;
  }

  private static includesTextBasedSubtitles(streams: Stream[]): boolean {
    return streams.some((stream) => TextBasedSubtitleExtractor.isSupportedTextBasedSubtitleStream(stream));
  }

  private static compareStreamsByLanguage(a: Stream, b: Stream, languagePriority: string[]): number {
    const aLang = a.tags.language ?? 'und';
    const bLang = b.tags.language ?? 'und';

    for (const language of languagePriority) {
      if (aLang == language) {
        return -1;
      }
      if (bLang == language) {
        return 1;
      }
    }

    return 0;
  }

  private static async checkEncoderCanBeUsed(encoder: string): Promise<boolean> {
    // FIXME: What happens when 'lavfi' is not available? We should check for that first. (Or is it always available?)
    const ffmpegProcess = new FfmpegProcess([
        '-f', 'lavfi',
        '-i', 'nullsrc',
        '-c:v', encoder,
        '-frames:v', '1',
        '-f', 'null',
        '-'
      ],
      {
        stdio: 'ignore',
        cwd: Os.tmpdir(),
        timeout: 10_000,
        killSignal: 'SIGKILL' // If we exceed the generous timeout, something is really wrong -> Force kill
      });

    return new Promise((resolve, reject) => {
      ffmpegProcess.getProcess().on('exit', (code) => resolve(code === 0));
      ffmpegProcess.getProcess().on('error', (error) => reject(error));
    });
  }
}
