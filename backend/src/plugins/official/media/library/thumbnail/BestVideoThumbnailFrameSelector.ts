import Fs from 'node:fs';
import Path from 'node:path';
import Sharp, { type Sharp as SharpInstance, type Stats as SharpStats } from 'sharp';
import { singleton } from 'tsyringe';

type RatedFrame = {
  sharpInstance: SharpInstance;
  usable: boolean;
  score: number;
}

@singleton()
export default class BestVideoThumbnailFrameSelector {
  private static readonly MIN_LUMA = 16;
  private static readonly MAX_LUMA = 240;
  private static readonly MIN_LUMA_SPREAD = 12;

  async determineBestFrame(directoryPath: string): Promise<SharpInstance> {
    const frames = await this.rateFrameImages(directoryPath);
    if (frames.length === 0) {
      throw new Error(`No selectable frame in directory: ${directoryPath}`);
    }

    const usableFrames = frames.filter((frame) => frame.usable);
    if (usableFrames.length === 0) {
      console.warn(`Every candidate thumbnail frame in ${directoryPath} is black, blown out or blank – picking the least bad one`);
    }

    const pool = usableFrames.length > 0 ? usableFrames : frames;
    return pool.reduce((best, frame) => frame.score > best.score ? frame : best).sharpInstance;
  }

  private async rateFrameImages(directoryPath: string): Promise<RatedFrame[]> {
    const fileNames = await Fs.promises.readdir(directoryPath);

    return Promise.all(fileNames
      .filter((fileName) => fileName.endsWith('.png'))
      .map((fileName) => this.rateFrameImage(Path.join(directoryPath, fileName))));
  }

  private async rateFrameImage(imagePath: string): Promise<RatedFrame> {
    const sharpInstance = Sharp(await Fs.promises.readFile(imagePath));
    const stats = await sharpInstance.stats();

    return {
      sharpInstance,
      usable: BestVideoThumbnailFrameSelector.looksUsable(stats),
      score: BestVideoThumbnailFrameSelector.rate(stats),
    };
  }

  /**
   * A frame outside these bounds is a fade, a title card or a wall, and no amount of sharpness makes it a thumbnail.
   * Ranking alone cannot express that, because the highest score of five bad frames is still a bad frame.
   */
  private static looksUsable(stats: SharpStats): boolean {
    const luma = BestVideoThumbnailFrameSelector.lumaOf(stats);

    return luma.mean >= BestVideoThumbnailFrameSelector.MIN_LUMA
      && luma.mean <= BestVideoThumbnailFrameSelector.MAX_LUMA
      && luma.spread >= BestVideoThumbnailFrameSelector.MIN_LUMA_SPREAD;
  }

  private static rate(stats: SharpStats): number {
    const score = (Math.min(stats.sharpness, 30) / 30) * 0.35
      + (Math.min(stats.entropy, 8) / 8) * 0.30
      + (Math.min(BestVideoThumbnailFrameSelector.lumaOf(stats).spread, 70) / 70) * 0.35;

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
