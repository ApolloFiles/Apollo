import type { HwEncoderOptions, HwVideoCodec } from './HwContext.js';

/**
 * What a job's argv is built for – plain software or one device in one mode ({@link HwContext}) – behind the same
 * handful of spellings, so a caller writes its command once.
 */
export interface Accel {
  /** Names this way of running a job in logs, stats and exclusion lists */
  readonly id: string;

  /** Whether the frames the caller's filters see live on a device – if so, a CPU filter needs {@link download} first */
  readonly framesOnGpu: boolean;

  /** Goes before `-i` */
  inputArgs(): string[];

  /** Use `-2` to keep the aspect ratio */
  scale(width: number, height: number): string;

  /** Filters that bring frames into system memory as 8-bit `nv12`, right before the first CPU filter; nothing when they already are */
  download(): string[];

  /** Filters that have to sit right before {@link encoder} */
  encoderInput(): string[];

  encoder(codec: HwVideoCodec, options: HwEncoderOptions): string[];

  /** An overlay filter that works on the frames where they are, or `null` if only the CPU `overlay` will do */
  overlay(): string | null;
}

const SOFTWARE_ENCODERS: Record<HwVideoCodec, string> = {
  h264: 'libx264',
};

class SoftwareContext implements Accel {
  readonly id = 'software';
  readonly framesOnGpu = false;

  inputArgs(): string[] {
    return [];
  }

  scale(width: number, height: number): string {
    return `scale=${width}:${height}`;
  }

  download(): string[] {
    return [];
  }

  /** Software encoders take whatever comes but are pinned to 8-bit 4:2:0 here, which is what every player decodes */
  encoderInput(): string[] {
    return ['format=yuv420p'];
  }

  encoder(codec: HwVideoCodec, options: HwEncoderOptions): string[] {
    return ['-c:v', SOFTWARE_ENCODERS[codec], '-preset', 'veryfast', '-crf', options.quality.toString()];
  }

  overlay(): string | null {
    return null;
  }
}

export const SOFTWARE: Accel = new SoftwareContext();
