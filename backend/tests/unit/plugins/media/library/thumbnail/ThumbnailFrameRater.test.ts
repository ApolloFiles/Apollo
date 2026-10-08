import Sharp, { type Sharp as SharpInstance } from 'sharp';
import ThumbnailFrameRater from '#src/plugins/official/media/library/thumbnail/ThumbnailFrameRater.js';

function solidImage(grey: number): SharpInstance {
  return Sharp({ create: { width: 64, height: 64, channels: 3, background: { r: grey, g: grey, b: grey } } });
}

function detailedImage(): SharpInstance {
  return Sharp({ create: { width: 64, height: 64, channels: 3, background: { r: 0, g: 0, b: 0 }, noise: { type: 'gaussian', mean: 128, sigma: 60 } } });
}

describe(ThumbnailFrameRater, () => {
  let rater: ThumbnailFrameRater;

  beforeEach(() => {
    rater = new ThumbnailFrameRater();
  });

  async function rate(image: SharpInstance): Promise<{ usable: boolean, score: number }> {
    return rater.rate(await Sharp(await image.png().toBuffer()).stats());
  }

  test.for([
    { name: 'black', grey: 0 },
    { name: 'blown out', grey: 255 },
    { name: 'flat mid-grey', grey: 128 },
  ])('Rates a $name frame as unusable', async ({ grey }) => {
    const rating = await rate(solidImage(grey));

    expect(rating.usable).toBe(false);
  });

  test('Rates a frame with detail as usable', async () => {
    const rating = await rate(detailedImage());

    expect(rating.usable).toBe(true);
  });

  test('Rates a single-channel greyscale frame with detail as usable, with a positive score', async () => {
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
