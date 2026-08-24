import Sharp, { type Sharp as SharpInstance } from 'sharp';
import { beforeEach, describe, expect, test } from 'vitest';
import ThumbnailFrameRater from '../../../../../../src/plugins/official/media/library/thumbnail/ThumbnailFrameRater.js';

let rater: ThumbnailFrameRater;

beforeEach(() => {
  rater = new ThumbnailFrameRater();
});

function solidImage(grey: number): SharpInstance {
  return Sharp({ create: { width: 64, height: 64, channels: 3, background: { r: grey, g: grey, b: grey } } });
}

function detailedImage(): SharpInstance {
  return Sharp({ create: { width: 64, height: 64, channels: 3, background: { r: 0, g: 0, b: 0 }, noise: { type: 'gaussian', mean: 128, sigma: 60 } } });
}

async function rate(image: SharpInstance): Promise<{ usable: boolean, score: number }> {
  return rater.rate(await Sharp(await image.png().toBuffer()).stats());
}

describe('ThumbnailFrameRater#rate', () => {
  test.each([
    ['black', 0],
    ['blown out', 255],
    ['flat mid-grey', 128],
  ])('Rates a %s frame as unusable', async (_name: string, grey: number) => {
    expect((await rate(solidImage(grey))).usable).toBe(false);
  });

  test('Rates a frame with detail as usable', async () => {
    expect((await rate(detailedImage())).usable).toBe(true);
  });

  test('Handles single-channel greyscale frames', async () => {
    const rating = await rate(detailedImage().greyscale());

    expect(rating.usable).toBe(true);
    expect(rating.score).toBeGreaterThan(0);
  });

  test('Scores a frame with detail above a flat one', async () => {
    const detailed = await rate(detailedImage());
    const flat = await rate(solidImage(128));

    expect(detailed.score).toBeGreaterThan(flat.score);
  });
});
