import { singleton } from 'tsyringe';
import type { Accel } from '../../../../../../ffmpeg/accel/Accel.js';
import HwContext from '../../../../../../ffmpeg/accel/HwContext.js';
import type { SubtitleStream, VideoStream } from '../../../../video/analyser/VideoAnalyser.Types.js';
import { BURN_IN_INPUT } from './BurnInInputs.js';

export interface TargetOptions {
  readonly fps: number;
  /** Whether the source runs faster than `fps` and has to be brought down to it */
  readonly capFrameRate: boolean;
  readonly width: number;
  readonly segmentDuration: number;
}

/**
 * The video half of a live transcode: scale, burn in a bitmap subtitle, encode – on whatever the given `accel` is.
 *
 * With frames on a device that has no overlay filter worth using, they come down for the CPU `overlay` and go back up
 * for the encoder; that costs a copy per frame but still beats decoding in software.
 */
@singleton()
export default class VideoStreamArgumentsBuilder {
  private static readonly QUALITY = 26;

  build(accel: Accel, videoStream: VideoStream, subtitleStream: SubtitleStream | null, target: TargetOptions): string[] {
    const videoInput = subtitleStream != null ? BURN_IN_INPUT.video : 0;
    const graph = new FilterGraphBuilder(`[${videoInput}:${videoStream.index}]`);

    if (videoStream.width !== target.width) {
      graph.append(accel.scale(target.width, -2));
    }
    if (subtitleStream != null) {
      VideoStreamArgumentsBuilder.appendOverlay(graph, accel, subtitleStream, VideoStreamArgumentsBuilder.outputDimensions(videoStream, target));
    } else {
      graph.append(...accel.encoderInput());
    }

    return [
      ...graph.toArgs(),
      ...accel.encoder('h264', { quality: VideoStreamArgumentsBuilder.QUALITY }),
      ...VideoStreamArgumentsBuilder.keyframeArgs(accel, target),
    ];
  }

  /**
   * The subtitle arrives as a canvas whose size the subtitle stream itself declares – 1080p subtitles on a 720p
   * video are a thing – so it is always brought to the size of the video it lands on, or the overlay clips
   * whatever falls outside the frame away.
   */
  private static appendOverlay(graph: FilterGraphBuilder, accel: Accel, subtitleStream: SubtitleStream, output: [width: number, height: number]): void {
    const subtitleInput = `[${BURN_IN_INPUT.subtitle}:${subtitleStream.index}]`;
    const subtitleChain = [`scale=${output[0]}:${output[1]}`];

    const hwOverlay = accel.overlay();
    if (hwOverlay != null && accel instanceof HwContext) {
      graph.appendTwoInputFilter(subtitleInput, [...subtitleChain, accel.upload('rgba')], hwOverlay);
      graph.append(...accel.encoderInput());
      return;
    }

    if (accel instanceof HwContext && accel.framesOnGpu) {
      graph.append(...accel.download());
      graph.appendTwoInputFilter(subtitleInput, subtitleChain, 'overlay');
      graph.append(accel.upload('nv12'));
      return;
    }

    graph.appendTwoInputFilter(subtitleInput, subtitleChain, 'overlay');
    graph.append(...accel.encoderInput());
  }

  private static outputDimensions(videoStream: VideoStream, target: TargetOptions): [width: number, height: number] {
    if (videoStream.width === target.width) {
      return [videoStream.width, videoStream.height];
    }
    return [target.width, 2 * Math.round((videoStream.height * target.width) / videoStream.width / 2)];
  }

  /**
   * Segments of `-hls_time` need a keyframe every that many seconds, no encoder may sneak in extra ones, and GOPs
   * must be closed – `independent_segments` promises players that every segment stands on its own.
   */
  private static keyframeArgs(accel: Accel, target: TargetOptions): string[] {
    const args = ['-flags:v', '+cgop', '-g', Math.round(target.fps * target.segmentDuration).toString()];
    if (target.capFrameRate) {
      args.push('-r', target.fps.toString());
    }
    if (!(accel instanceof HwContext)) {
      args.push('-sc_threshold', '0');
    } else if (accel.api === 'cuda') {
      args.push('-no-scenecut', '1');
    }
    return args;
  }
}

/** Collects single-input filters into one chain and splits it wherever a second input joins */
class FilterGraphBuilder {
  private readonly segments: string[] = [];
  private pending: string[] = [];
  private labelCounter = 0;

  constructor(
    private currentLabel: string,
  ) {
  }

  append(...filters: string[]): void {
    this.pending.push(...filters);
  }

  appendTwoInputFilter(secondInputLabel: string, secondInputFilters: string[], filter: string): void {
    this.flush();

    const secondLabel = this.nextLabel();
    this.segments.push(`${secondInputLabel}${secondInputFilters.join(',')}${secondLabel}`);

    const outLabel = this.nextLabel();
    this.segments.push(`${this.currentLabel}${secondLabel}${filter}${outLabel}`);
    this.currentLabel = outLabel;
  }

  toArgs(): string[] {
    if (this.segments.length === 0 && this.pending.length === 0) {
      return ['-map', this.currentLabel.slice(1, -1)];
    }

    if (this.pending.length > 0) {
      this.flushTo('[vout]');
    }
    return ['-filter_complex', this.segments.join(';'), '-map', this.currentLabel];
  }

  /** Writes the pending filters as a segment of their own, if there are any */
  private flush(): void {
    if (this.pending.length > 0) {
      this.flushTo(this.nextLabel());
    }
  }

  /** Only callable with filters pending – a label-only segment would not parse */
  private flushTo(outLabel: string): void {
    if (this.pending.length === 0) {
      throw new Error('Nothing to write between the labels');
    }
    this.segments.push(`${this.currentLabel}${this.pending.join(',')}${outLabel}`);
    this.currentLabel = outLabel;
    this.pending = [];
  }

  private nextLabel(): string {
    return `[v${this.labelCounter++}]`;
  }
}
