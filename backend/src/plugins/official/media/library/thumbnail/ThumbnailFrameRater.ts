import type { Stats as SharpStats } from 'sharp';
import { singleton } from 'tsyringe';

export type FrameRating = {
  /** Whether the frame is worth showing at all, independent of how it compares to the other candidates. */
  usable: boolean;
  score: number;
}

@singleton()
export default class ThumbnailFrameRater {
  private static readonly MIN_LUMA = 16;
  private static readonly MAX_LUMA = 240;
  private static readonly MIN_LUMA_SPREAD = 12;

  rate(stats: SharpStats): FrameRating {
    const luma = ThumbnailFrameRater.lumaOf(stats);

    return {
      usable: luma.mean >= ThumbnailFrameRater.MIN_LUMA
        && luma.mean <= ThumbnailFrameRater.MAX_LUMA
        && luma.spread >= ThumbnailFrameRater.MIN_LUMA_SPREAD,
      score: ThumbnailFrameRater.score(stats, luma.spread),
    };
  }

  private static score(stats: SharpStats, lumaSpread: number): number {
    const score = (Math.min(stats.sharpness, 30) / 30) * 0.35
      + (Math.min(stats.entropy, 8) / 8) * 0.30
      + (Math.min(lumaSpread, 70) / 70) * 0.35;

    return Number.isFinite(score) ? score : 0;
  }

  /**
   * Rec. 601 luma. Weighting the per-channel means yields the exact luma mean because the mean is linear – the
   * spread averages the per-channel deviations instead, which only approximates it but ranks frames the same way.
   */
  private static lumaOf(stats: SharpStats): { mean: number, spread: number } {
    const [red, green = red, blue = red] = stats.channels;

    return {
      mean: (0.299 * red.mean) + (0.587 * green.mean) + (0.114 * blue.mean),
      spread: (red.stdev + green.stdev + blue.stdev) / 3,
    };
  }
}
