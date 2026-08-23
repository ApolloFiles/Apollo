import ProbeTagUtil from './ProbeTagUtil.js';

/** Everything needed to tell how far a single stream reaches, regardless of its type. */
export type StreamSpanSource = {
  /** ffprobe's `stream.duration` (seconds as a decimal string) */
  duration?: string | null,

  /** ffprobe's `stream.duration_ts`, only usable together with {@link timeBase} */
  durationTs?: number | null,
  /** ffprobe's `stream.time_base` (e.g. `1/1000`) */
  timeBase?: string | null,

  tags: Record<string, string>,
}

export type DurationRelevantStream = StreamSpanSource & {
  type: 'video' | 'audio',
}

/**
 * Determines how long a file actually *plays*.
 *
 * A container may claim a longer runtime than it plays: Matroska reports the end of its longest
 * track as `format.duration`, so a subtitle track that outlives video and audio by a minute makes
 * the whole file look a minute longer than it is.
 */
export default class PlayableDurationUtil {
  /**
   * Cover art is embedded as a video stream and would otherwise be mistaken for the movie itself.
   * `disposition.attached_pic` cannot be used to tell them apart: FFmpeg does not write it into
   * Matroska at all (not even when explicitly asked to), where such a stream spans a few frames.
   * Nothing anyone would sit down and watch is shorter than a second.
   */
  private static readonly MIN_PLAUSIBLE_VIDEO_SPAN_IN_SEC = 1;

  /**
   * Seconds between the first and the last packet of a stream – *not* the accumulated on-screen time.
   *
   * Matroska does not write `stream.duration`; muxers store the per-track length in a `DURATION` tag
   * instead (`DURATION-eng` when written by MakeMKV).
   */
  static determineStreamSpanInSec(stream: StreamSpanSource): number | null {
    const spanFromTag = ProbeTagUtil.parseDurationTag(ProbeTagUtil.getValueIncludingLanguageSuffixed(stream.tags, 'DURATION'));
    if (spanFromTag != null && spanFromTag > 0) {
      return spanFromTag;
    }

    const spanFromStream = this.parseFiniteFloat(stream.duration);
    if (spanFromStream != null && spanFromStream > 0) {
      return spanFromStream;
    }

    const spanFromTimeBase = this.calculateSpanFromTimeBase(stream.durationTs, stream.timeBase);
    if (spanFromTimeBase != null && spanFromTimeBase > 0) {
      return spanFromTimeBase;
    }

    return null;
  }

  /**
   * The duration of the video track (the longest one, if a file has multiple), falling back to the
   * longest audio track and finally to `formatDurationInSec`. Never exceeds `formatDurationInSec`.
   *
   * Returns `null` if neither the streams nor the container provide anything usable.
   */
  static determinePlayableDurationInSec(streams: DurationRelevantStream[], formatDurationInSec: number | null): number | null {
    const containerDuration = (formatDurationInSec != null && Number.isFinite(formatDurationInSec) && formatDurationInSec > 0)
      ? formatDurationInSec
      : null;

    const playableDuration = this.determineLongestSpanInSec(streams, 'video')
      ?? this.determineLongestSpanInSec(streams, 'audio')
      ?? containerDuration;
    if (playableDuration == null) {
      return null;
    }

    if (containerDuration != null && playableDuration > containerDuration) {
      return containerDuration;
    }
    return playableDuration;
  }

  private static determineLongestSpanInSec(streams: DurationRelevantStream[], type: DurationRelevantStream['type']): number | null {
    const minimumSpanInSec = type === 'video' ? this.MIN_PLAUSIBLE_VIDEO_SPAN_IN_SEC : 0;
    let longestSpanInSec: number | null = null;

    for (const stream of streams) {
      if (stream.type !== type) {
        continue;
      }

      const spanInSec = this.determineStreamSpanInSec(stream);
      if (spanInSec != null && spanInSec >= minimumSpanInSec && (longestSpanInSec == null || spanInSec > longestSpanInSec)) {
        longestSpanInSec = spanInSec;
      }
    }

    return longestSpanInSec;
  }

  private static calculateSpanFromTimeBase(durationTs: number | null | undefined, timeBase: string | null | undefined): number | null {
    if (durationTs == null || !Number.isFinite(durationTs) || timeBase == null) {
      return null;
    }

    const [rawNumerator, rawDenominator] = timeBase.split('/');
    const numerator = this.parseFiniteFloat(rawNumerator);
    const denominator = this.parseFiniteFloat(rawDenominator);
    if (numerator == null || denominator == null || denominator === 0) {
      return null;
    }

    return (durationTs * numerator) / denominator;
  }

  static parseFiniteFloat(rawValue: string | null | undefined): number | null {
    if (rawValue == null) {
      return null;
    }

    const parsedValue = parseFloat(rawValue);
    return Number.isFinite(parsedValue) ? parsedValue : null;
  }
}
