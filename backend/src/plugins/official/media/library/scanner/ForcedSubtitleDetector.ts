export type SubtitleStreamCandidate = {
  /** ffprobe stream index. */
  index: number,
  /** Canonicalized language of the stream ('und' when unknown). */
  normalizedLanguage: string,
  /** Stream title, already trimmed ('' when the stream carries none). */
  title: string,
  /** ffprobe's `disposition.forced`. */
  forcedDisposition: boolean,
  /** Number of subtitle events, from the muxer's `NUMBER_OF_FRAMES` statistics tag. */
  eventCount: number | null,
  /** Seconds between the first and the last subtitle event, from `DURATION` (not the sum of on-screen time). */
  spanInSec: number | null,
}

/**
 * Decides which subtitle streams only cover signs, songs and foreign dialogue instead of the full
 * audio, so that they can be shown on top of same-language audio ('Signs & Songs' / 'forced').
 *
 * Only metadata that ffprobe already reports for free is used – actually counting subtitle events
 * means demuxing the whole file (measured: ~4 GiB of reads for a 24 min episode), which is far too
 * expensive to do for every file of a library scan.
 *
 * Every threshold below is deliberately conservative: mislabeling a full subtitle stream as
 * 'Signs & Songs' leaves a viewer without subtitles, which is much worse than missing the flag.
 */
export default class ForcedSubtitleDetector {
  /** Both the usual English labels and the ones muxers derive from them. */
  private static readonly TITLE_REGEX = /\b(?:forced|signs?|songs?|s\s*&\s*s)\b/i;

  /**
   * Full subtitle streams sit far above this (measured: 9.4–35 events/min across the sampled
   * library), 'Signs & Songs' streams far below it (measured: 1.2–2.8 events/min).
   */
  private static readonly MAX_EVENTS_PER_MINUTE = 5;

  /** A stream whose events barely span the runtime cannot be following the dialogue. */
  private static readonly MAX_SPAN_RATIO = 0.1;

  /** How much smaller than the largest same-language stream a stream has to be to stand out. */
  private static readonly MAX_RELATIVE_RATIO = 0.25;

  /** Below this the reference stream is too small for the comparison to mean anything. */
  private static readonly MIN_COMPARABLE_SPAN_RATIO = 0.5;
  private static readonly MIN_COMPARABLE_EVENT_COUNT = 50;

  /** Ratios of a very short clip (trailer, gallery, extra) are pure noise. */
  private static readonly MIN_RUNTIME_IN_SEC = 60;

  /**
   * @param candidates every subtitle stream of a single file
   * @param runtimeInSec how long the file actually plays (video/audio), not the span of any subtitle stream
   * @returns the indices of the streams to flag
   */
  static detect(candidates: SubtitleStreamCandidate[], runtimeInSec: number): Set<number> {
    const forcedStreamIndices = new Set<number>();
    const sameLanguageCandidates = this.groupByLanguage(candidates);

    for (const candidate of candidates) {
      const isForced =
        this.TITLE_REGEX.test(candidate.title)
        || this.hasSparseContent(candidate, runtimeInSec)
        || this.hasSparseContentComparedToSiblings(candidate, sameLanguageCandidates.get(candidate.normalizedLanguage) ?? [], runtimeInSec)
        // forced dispositions are often abused to influence stream selection in 'dumb' video players
        // and can thus only be trusted when nothing else describes the stream
        || (candidate.title === '' && candidate.forcedDisposition);

      if (isForced) {
        forcedStreamIndices.add(candidate.index);
      }
    }

    return forcedStreamIndices;
  }

  /** Absolute check – works for a stream that has no same-language sibling to compare against. */
  private static hasSparseContent(candidate: SubtitleStreamCandidate, runtimeInSec: number): boolean {
    if (runtimeInSec < this.MIN_RUNTIME_IN_SEC) {
      return false;
    }

    if (candidate.eventCount != null && (candidate.eventCount / (runtimeInSec / 60)) < this.MAX_EVENTS_PER_MINUTE) {
      return true;
    }
    return candidate.spanInSec != null && (candidate.spanInSec / runtimeInSec) < this.MAX_SPAN_RATIO;
  }

  /**
   * Relative check – catches the common DVD/Blu-ray layout of a full stream next to a much smaller
   * one in the same language, where the smaller one is the forced/signs stream.
   */
  private static hasSparseContentComparedToSiblings(
    candidate: SubtitleStreamCandidate,
    sameLanguageCandidates: SubtitleStreamCandidate[],
    runtimeInSec: number,
  ): boolean {
    // 'und' streams are only grouped by the *absence* of a language – they are frequently
    // differently-languaged streams and must not be compared against each other
    if (candidate.normalizedLanguage === 'und' || sameLanguageCandidates.length < 2) {
      return false;
    }

    if (candidate.spanInSec != null && runtimeInSec >= this.MIN_RUNTIME_IN_SEC) {
      const largestSpanInSec = this.largestOf(sameLanguageCandidates, sibling => sibling.spanInSec);
      if (largestSpanInSec != null
        && (largestSpanInSec / runtimeInSec) >= this.MIN_COMPARABLE_SPAN_RATIO
        && candidate.spanInSec < (largestSpanInSec * this.MAX_RELATIVE_RATIO)) {
        return true;
      }
    }

    if (candidate.eventCount != null) {
      const largestEventCount = this.largestOf(sameLanguageCandidates, sibling => sibling.eventCount);
      if (largestEventCount != null
        && largestEventCount >= this.MIN_COMPARABLE_EVENT_COUNT
        && candidate.eventCount < (largestEventCount * this.MAX_RELATIVE_RATIO)) {
        return true;
      }
    }

    return false;
  }

  private static largestOf(
    candidates: SubtitleStreamCandidate[],
    valueExtractor: (candidate: SubtitleStreamCandidate) => number | null,
  ): number | null {
    let largestValue: number | null = null;
    for (const candidate of candidates) {
      const value = valueExtractor(candidate);
      if (value != null && (largestValue == null || value > largestValue)) {
        largestValue = value;
      }
    }
    return largestValue;
  }

  private static groupByLanguage(candidates: SubtitleStreamCandidate[]): Map<string, SubtitleStreamCandidate[]> {
    const groupedCandidates = new Map<string, SubtitleStreamCandidate[]>();
    for (const candidate of candidates) {
      const group = groupedCandidates.get(candidate.normalizedLanguage);
      if (group != null) {
        group.push(candidate);
      } else {
        groupedCandidates.set(candidate.normalizedLanguage, [candidate]);
      }
    }
    return groupedCandidates;
  }
}
