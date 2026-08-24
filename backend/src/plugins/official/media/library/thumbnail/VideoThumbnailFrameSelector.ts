import Fs from 'node:fs';
import Sharp, { type Sharp as SharpInstance } from 'sharp';
import { singleton } from 'tsyringe';
import ThumbnailFrameRater, { type FrameRating } from './ThumbnailFrameRater.js';

type RatedFrame = FrameRating & {
  sharpInstance: SharpInstance;
}

@singleton()
export default class VideoThumbnailFrameSelector {
  constructor(
    private readonly thumbnailFrameRater: ThumbnailFrameRater,
  ) {
  }

  async selectBestFrame(framePaths: string[]): Promise<SharpInstance> {
    if (framePaths.length === 0) {
      throw new Error('No candidate frame to select a thumbnail from');
    }
    const frames = await Promise.all(framePaths.map((framePath) => this.rateFrameImage(framePath)));

    const usableFrames = frames.filter((frame) => frame.usable);
    if (usableFrames.length === 0) {
      console.warn(`Every candidate thumbnail frame is black, blown out or blank – picking the least bad one: ${framePaths.join(', ')}`);
    }

    const pool = usableFrames.length > 0 ? usableFrames : frames;
    return pool.reduce((best, frame) => frame.score > best.score ? frame : best).sharpInstance;
  }

  private async rateFrameImage(imagePath: string): Promise<RatedFrame> {
    const sharpInstance = Sharp(await Fs.promises.readFile(imagePath));

    return {
      sharpInstance,
      ...this.thumbnailFrameRater.rate(await sharpInstance.stats()),
    };
  }
}
