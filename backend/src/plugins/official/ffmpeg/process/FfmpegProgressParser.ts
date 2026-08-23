export type FfmpegProgress = {
  readonly frame: number | null;
  readonly fps: number | null;
  readonly bitrateInKilobitsPerSecond: number | null;
  readonly totalSizeInBytes: number | null;
  readonly outTimeInMillis: number | null;
  readonly duplicatedFrames: number | null;
  readonly droppedFrames: number | null;
  readonly speed: number | null;
  readonly finished: boolean;
}

/**
 * Parses the `key=value` blocks written by FFmpeg's `-progress` option.
 *
 * A block is only complete once the `progress=` line arrives, so lines are accumulated until then.
 */
export default class FfmpegProgressParser {
  private pendingFields = new Map<string, string>();

  consumeLine(line: string): FfmpegProgress | null {
    const separatorIndex = line.indexOf('=');
    if (separatorIndex === -1) {
      return null;
    }

    const key = line.substring(0, separatorIndex).trim();
    const value = line.substring(separatorIndex + 1).trim();

    if (key !== 'progress') {
      this.pendingFields.set(key, value);
      return null;
    }

    const progress = this.buildProgress(value === 'end');
    this.pendingFields = new Map();
    return progress;
  }

  private buildProgress(finished: boolean): FfmpegProgress {
    return {
      frame: this.parseNumber('frame'),
      fps: this.parseNumber('fps'),
      bitrateInKilobitsPerSecond: this.parseNumber('bitrate', 'kbits/s'),
      totalSizeInBytes: this.parseNumber('total_size'),
      outTimeInMillis: this.parseOutTimeInMillis(),
      duplicatedFrames: this.parseNumber('dup_frames'),
      droppedFrames: this.parseNumber('drop_frames'),
      speed: this.parseNumber('speed', 'x'),
      finished,
    };
  }

  /** `out_time_ms` is a misnomer and reports microseconds, so `out_time_us` is used instead. */
  private parseOutTimeInMillis(): number | null {
    const outTimeInMicros = this.parseNumber('out_time_us');
    if (outTimeInMicros == null) {
      return null;
    }
    return outTimeInMicros / 1000;
  }

  private parseNumber(key: string, unitSuffix?: string): number | null {
    let value = this.pendingFields.get(key);
    if (value == null) {
      return null;
    }

    if (unitSuffix != null && value.endsWith(unitSuffix)) {
      value = value.slice(0, -unitSuffix.length);
    }

    const parsedValue = parseFloat(value);
    return Number.isFinite(parsedValue) ? parsedValue : null;
  }
}
