import {Stream, VideoStream} from '../../../video/analyser/VideoAnalyser.Types';

export interface TargetOptions {
  readonly fps: number;
  readonly width: number;
  readonly segmentDuration: number;
}

interface PreparedComplexFilter {
  args: string[];
  videoStreamIdentifier: string;
}

export default class VideoEncoderArgsBuilder {
  public static readonly SUPPORTED_ENCODERS = ['h264_nvenc', /*'h264_vaapi',*/ 'h264_qsv', 'libx264'];
  private static readonly SUPPORTED_IMAGE_BASED_SUBTITLES = ['hdmv_pgs_subtitle', 'dvb_subtitle', 'dvd_subtitle'];

  public static buildArgs(videoStream: VideoStream, streamsToTranscode: Stream[], target: TargetOptions, encoder: string): string[] {
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

  private static buildArgsForH264Nvenc(videoStream: VideoStream, streamsToTranscode: Stream[], target: TargetOptions): string[] {
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
      '-bufsize:v', '240M'
    ];
    if (complexFilter.args.length > 0) {
      args.push(`-filter_complex`, complexFilter.args.join(','));
    }

    return args;
  }

  private static buildArgsForH264Qsv(videoStream: VideoStream, streamsToTranscode: Stream[], target: TargetOptions): string[] {
    const complexFilter = this.prepareComplexFilter(videoStream, streamsToTranscode, target.width);

    const args = [
      '-map', complexFilter.videoStreamIdentifier,

      '-c:v', 'h264_qsv',

      '-flags:v', '+cgop',
      '-g:v', (target.fps * 2).toFixed(0),

      '-r:v', target.fps.toFixed(0),
      '-pix_fmt:v', 'nv12',

      '-maxrate:v', '120M',
      '-bufsize:v', '240M'
    ];
    if (complexFilter.args.length > 0) {
      args.push(`-filter_complex`, complexFilter.args.join(','));
    }

    return args;
  }

  private static buildArgsForLibx264(videoStream: VideoStream, streamsToTranscode: Stream[], target: TargetOptions): string[] {
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
      '-bufsize:v', '240M'
    ];
    if (complexFilter.args.length > 0) {
      args.push(`-filter_complex`, complexFilter.args.join(','));
    }

    return args;
  }

  private static prepareComplexFilter(videoStream: VideoStream, streamsToTranscode: Stream[], targetWidth: number): PreparedComplexFilter {
    const videoFilters: string[] = [];
    let currentVideoStream = `0:${videoStream.index}`;

    // Needed for hard subs of text-based subtitles:
    // videoFilters.push(`subtitles=filename='${inputFilePath}'` + ':stream_index=' + subtitleStreamIndex);

    if (videoStream.width != targetWidth) {
      videoFilters.push(`scale=${targetWidth}:-1`);
      // TODO: scale_cuda might not be available and scaling might exhaust the system's memory... Maybe we should just remove for now?
      // videoFilters.push(`scale_cuda=w=${target.width}:force_original_aspect_ratio=decrease`);
    }

    for (const stream of streamsToTranscode) {
      if (stream.codecType != 'subtitle' || !this.SUPPORTED_IMAGE_BASED_SUBTITLES.includes(stream.codecName)) {
        continue;
      }

      if (currentVideoStream.indexOf('[') === -1) {
        currentVideoStream = `[${currentVideoStream}]`;
      }

      // TODO: Add support for hw accelerated filters like 'overlay_cuda'
      const filterPrefix = `${currentVideoStream}[0:${stream.index}]overlay`;
      currentVideoStream = `[v${videoFilters.length + 1}]`;
      videoFilters.push(filterPrefix + currentVideoStream);
    }

    return {
      args: videoFilters,
      videoStreamIdentifier: currentVideoStream
    };
  }
}
