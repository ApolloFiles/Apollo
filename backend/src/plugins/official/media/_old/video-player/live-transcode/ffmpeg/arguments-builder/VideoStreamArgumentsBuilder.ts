import { singleton } from 'tsyringe';
import type { Stream, VideoStream } from '../../../../video/analyser/VideoAnalyser.Types.js';
import ImageBasedSubtitleHelper from '../ImageBasedSubtitleHelper.js';

export interface TargetOptions {
  readonly fps: number;
  readonly width: number;
  readonly segmentDuration: number;
}

interface PreparedComplexFilter {
  args: string[];
  videoStreamIdentifier: string;
}

@singleton()
export default class VideoStreamArgumentsBuilder {
  /** Sorted array; Most favorable encoder at the start */
  public static readonly SUPPORTED_ENCODERS = ['h264_nvenc', /*'h264_vaapi',*/ 'h264_qsv', 'libx264'];

  build(videoStream: VideoStream, streamsToTranscode: Stream[], target: TargetOptions, encoder: string): string[] {
    switch (encoder) {
      case 'h264_nvenc':
        return this.buildArgsForH264Nvenc(videoStream, streamsToTranscode, target);
      case 'h264_qsv':
        return this.buildArgsForH264Qsv(videoStream, streamsToTranscode, target);
      case 'libx264':
        return this.buildArgsForLibx264(videoStream, streamsToTranscode, target);

      default:
        throw new Error('Buildings args for encoder ' + encoder + ' is not yet implemented');
    }
  }

  private buildArgsForH264Nvenc(videoStream: VideoStream, streamsToTranscode: Stream[], target: TargetOptions): string[] {
    const complexFilter = this.prepareComplexFilter(videoStream, streamsToTranscode, target.width);

    const args = [
      '-map', complexFilter.videoStreamIdentifier,

      '-c:v', 'h264_nvenc',
      '-preset:v', 'p6',
      '-profile:v', 'high',
      '-tune:v', 'hq',
      '-rc-lookahead:v', '8',
      '-bf:v', '2',
      '-rc:v', 'vbr',
      '-cq:v', '26',

      '-flags:v', '+cgop',
      '-g:v', (target.fps * 2).toFixed(0),
      '-no-scenecut:v', '1',

      '-r:v', target.fps.toFixed(0),
      '-pix_fmt:v', 'yuv420p',

      '-b:v', '0',
      '-maxrate:v', '120M',
      '-bufsize:v', '240M',
    ];
    if (complexFilter.args.length > 0) {
      args.push(`-filter_complex`, complexFilter.args.join(';'));
    }

    return args;
  }

  private buildArgsForH264Qsv(videoStream: VideoStream, streamsToTranscode: Stream[], target: TargetOptions): string[] {
    const complexFilter = this.prepareComplexFilter(videoStream, streamsToTranscode, target.width);

    const args = [
      '-map', complexFilter.videoStreamIdentifier,

      '-c:v', 'h264_qsv',

      '-flags:v', '+cgop',
      '-g:v', (target.fps * 2).toFixed(0),

      '-r:v', target.fps.toFixed(0),
      '-pix_fmt:v', 'nv12',

      '-maxrate:v', '120M',
      '-bufsize:v', '240M',
    ];
    if (complexFilter.args.length > 0) {
      args.push(`-filter_complex`, complexFilter.args.join(';'));
    }

    return args;
  }

  private buildArgsForLibx264(videoStream: VideoStream, streamsToTranscode: Stream[], target: TargetOptions): string[] {
    const complexFilter = this.prepareComplexFilter(videoStream, streamsToTranscode, target.width);

    const args = [
      '-map', complexFilter.videoStreamIdentifier,

      '-c:v', 'libx264',
      '-preset:v', 'veryfast',
      '-profile:v', 'high',
      '-crf', '26',

      '-flags:v', '+cgop',
      '-g:v', (target.fps * 2).toFixed(0),
      '-sc_threshold', '0',

      '-r:v', target.fps.toFixed(0),
      '-pix_fmt:v', 'yuv420p',

      '-maxrate:v', '120M',
      '-bufsize:v', '240M',
    ];
    if (complexFilter.args.length > 0) {
      args.push(`-filter_complex`, complexFilter.args.join(';'));
    }

    return args;
  }

  private prepareComplexFilter(videoStream: VideoStream, streamsToTranscode: Stream[], targetWidth: number): PreparedComplexFilter {
    const filterChainSegments: string[] = [];
    // Label of the most recent filtergraph output; starts as the raw input stream.
    let currentLabel = `[0:${videoStream.index}]`;

    // Needed for hard subs of text-based subtitles:
    // filterChainSegments.push(`${currentLabel}subtitles=filename='${inputFilePath}':stream_index=${subtitleStreamIndex}[v${filterChainSegments.length}]`);

    if (videoStream.width != targetWidth) {
      const outLabel = `[v${filterChainSegments.length}]`;
      filterChainSegments.push(`${currentLabel}scale=${targetWidth}:-1${outLabel}`);
      currentLabel = outLabel;
    }

    for (const stream of streamsToTranscode) {
      if (!ImageBasedSubtitleHelper.isSupportedImageBasedSubtitleStream(stream)) {
        continue;
      }

      // TODO: Add support for hw accelerated filters like 'overlay_cuda'
      const outLabel = `[v${filterChainSegments.length}]`;
      filterChainSegments.push(`${currentLabel}[0:${stream.index}]overlay${outLabel}`);
      currentLabel = outLabel;
    }

    if (filterChainSegments.length === 0) {
      // No filtering required: map the raw input stream directly.
      return {
        args: [],
        videoStreamIdentifier: `0:${videoStream.index}`,
      };
    }

    return {
      args: filterChainSegments,
      videoStreamIdentifier: currentLabel,
    };
  }
}
