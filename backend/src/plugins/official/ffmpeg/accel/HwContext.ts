import type { Accel } from './Accel.js';
import type { FfmpegDevice } from './FfmpegDevice.js';
import type { FfmpegHardwareApi } from './FfmpegHardwareApi.js';
import type { VideoBitDepth } from './PixelFormatUtil.js';

/**
 * - `fullChain`: decode, filter and (optionally) encode on the device; frames only leave it through {@link HwContext#download}
 * - `encodeOnly`: decode and filter in software, upload right before a hardware encoder
 */
export type HwMode = 'fullChain' | 'encodeOnly';

export type HwVideoCodec = 'h264';

export type HwEncoderOptions = {
  /** Constant-quality target on the 0–51 scale every supported encoder uses; higher means smaller and worse */
  readonly quality: number;
}

/**
 * One device, one mode, one input – and every device-specific spelling a command needs, so a caller can assemble
 * its own argv without knowing which flags a vendor wants.
 *
 * Deeper-than-8-bit frames are converted wherever they are about to leave the device or meet an encoder
 * ({@link download}, {@link encoderInput}), never in {@link scale}: the methods do not depend on each other having
 * been called, and the conversion lands after any overlay, which is the only order FFmpeg 6.1 copes with.
 */
export default class HwContext implements Accel {
  private static readonly DEVICE_NAME = 'gpu';

  constructor(
    readonly device: FfmpegDevice,
    readonly mode: HwMode,
    private readonly inputBitDepth: VideoBitDepth,
  ) {
  }

  /** Names this exact way of running a job in logs, stats and exclusion lists (e.g. `vaapi:/dev/dri/renderD128/fullChain`) */
  get id(): string {
    return `${this.device.id}/${this.mode}`;
  }

  get api(): FfmpegHardwareApi {
    return this.device.api;
  }

  /** Whether the frames the caller's filters see live on the device – if so, a CPU filter needs {@link download} first */
  get framesOnGpu(): boolean {
    return this.mode === 'fullChain';
  }

  /** Goes before `-i` */
  inputArgs(): string[] {
    const args = [...this.deviceInitArgs()];
    if (this.mode === 'encodeOnly') {
      return args;
    }

    args.push(
      '-hwaccel', this.api,
      '-hwaccel_device', HwContext.DEVICE_NAME,
      '-hwaccel_output_format', this.api,
    );
    return args;
  }

  /** Use `-2` to keep the aspect ratio */
  scale(width: number, height: number): string {
    if (!this.framesOnGpu) {
      return `scale=${width}:${height}`;
    }
    return `${this.scaleFilterName()}=w=${width}:h=${this.api === 'qsv' ? HwContext.normalizeQsvDimension(height) : height}`;
  }

  /** Filters that bring frames into system memory as 8-bit `nv12`, right before the first CPU filter; nothing when they already are */
  download(): string[] {
    if (!this.framesOnGpu) {
      return [];
    }
    return [...this.convertTo8Bit(), 'hwdownload', 'format=nv12'];
  }

  /** Filters that move system-memory frames of the given format onto the device */
  upload(format: 'nv12' | 'rgba'): string {
    switch (this.api) {
      case 'vaapi':
        return `format=${format},hwupload`;
      case 'qsv':
        return `format=${format},hwupload=extra_hw_frames=64`;
      case 'cuda':
        return `format=${format},hwupload_cuda`;
    }
  }

  /** Filters that have to sit right before {@link encoder}: an upload in `encodeOnly`, an 8-bit conversion for deeper frames on the device */
  encoderInput(): string[] {
    switch (this.mode) {
      case 'fullChain':
        return this.convertTo8Bit();
      case 'encodeOnly':
        return this.api === 'vaapi' ? [this.upload('nv12')] : ['format=nv12'];
    }
  }

  encoder(codec: HwVideoCodec, options: HwEncoderOptions): string[] {
    const quality = options.quality.toString();
    switch (this.api) {
      case 'vaapi':
        return [
          '-c:v', `${codec}_vaapi`,
          '-rc_mode', 'CQP',
          '-qp', quality,
        ];

      case 'qsv':
        return [
          '-c:v', `${codec}_qsv`,
          '-global_quality', quality,
        ];

      case 'cuda':
        return [
          '-c:v', `${codec}_nvenc`,
          '-preset', 'p6',
          '-rc', 'vbr',
          '-cq', quality,
          '-b:v', '0',
        ];
    }
  }

  /**
   * The on-device overlay filter, or `null` where the device has none worth using: AMD's VAAPI driver has no overlay
   * at all and `overlay_cuda` on FFmpeg 6.1 only takes overlays without alpha. The overlay input is expected to be
   * uploaded with {@link upload}(`'rgba'`).
   */
  overlay(): string | null {
    if (!this.framesOnGpu) {
      return null;
    }
    if (this.api === 'vaapi' && this.device.vendor === 'intel') {
      return 'overlay_vaapi';
    }
    if (this.api === 'qsv') {
      return 'overlay_qsv';
    }
    return null;
  }

  private convertTo8Bit(): string[] {
    return this.inputBitDepth === 8 ? [] : [`${this.scaleFilterName()}=format=nv12`];
  }

  private deviceInitArgs(): string[] {
    return ['-init_hw_device', this.deviceInitSpec(), '-filter_hw_device', HwContext.DEVICE_NAME];
  }

  private deviceInitSpec(): string {
    switch (this.api) {
      case 'vaapi':
        return `vaapi=${HwContext.DEVICE_NAME}:${this.device.address}`;
      case 'qsv':
        return `qsv=${HwContext.DEVICE_NAME}:hw,child_device=${this.device.address}`;
      case 'cuda':
        return `cuda=${HwContext.DEVICE_NAME}:${this.device.address}`;
    }
  }

  private scaleFilterName(): string {
    switch (this.api) {
      case 'vaapi':
        return 'scale_vaapi';
      case 'qsv':
        return 'vpp_qsv';
      case 'cuda':
        return 'scale_cuda';
    }
  }

  private static normalizeQsvDimension(dimension: number): number {
    return dimension < 0 ? -1 : dimension;
  }
}
