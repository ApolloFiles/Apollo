import Fs from 'node:fs';
import Os from 'node:os';
import Path from 'node:path';
import Sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import BestVideoThumbnailFrameSelector from '../../../../../../src/plugins/official/media/library/thumbnail/BestVideoThumbnailFrameSelector.js';

let frameDirectory: string;
let selector: BestVideoThumbnailFrameSelector;

beforeEach(async () => {
  frameDirectory = await Fs.promises.mkdtemp(Path.join(Os.tmpdir(), 'thumbnail-frame-selector-'));
  selector = new BestVideoThumbnailFrameSelector();
});

afterEach(async () => {
  await Fs.promises.rm(frameDirectory, { recursive: true, force: true });
});

async function writeSolidFrame(fileName: string, grey: number): Promise<void> {
  await Sharp({ create: { width: 64, height: 64, channels: 3, background: { r: grey, g: grey, b: grey } } })
    .png()
    .toFile(Path.join(frameDirectory, fileName));
}

async function writeDetailedFrame(fileName: string): Promise<void> {
  await Sharp({ create: { width: 64, height: 64, channels: 3, background: { r: 0, g: 0, b: 0 }, noise: { type: 'gaussian', mean: 128, sigma: 60 } } })
    .png()
    .toFile(Path.join(frameDirectory, fileName));
}

async function selectedFrameSpread(): Promise<number> {
  const stats = await (await selector.determineBestFrame(frameDirectory)).stats();
  return stats.channels[0].stdev;
}

describe('BestVideoThumbnailFrameSelector#determineBestFrame', () => {
  test.each([
    ['a black frame', 0],
    ['a blown out frame', 255],
    ['a flat mid-grey frame', 128],
  ])('Skips %s in favour of a usable one', async (_name: string, grey: number) => {
    await writeSolidFrame('frame_001.png', grey);
    await writeDetailedFrame('frame_002.png');

    expect(await selectedFrameSpread()).toBeGreaterThan(20);
  });

  test('Falls back to the least bad frame when every candidate is unusable', async () => {
    await writeSolidFrame('frame_001.png', 0);
    await writeSolidFrame('frame_002.png', 255);

    await expect(selector.determineBestFrame(frameDirectory)).resolves.toBeDefined();
  });

  test('Ignores files that are not frame images', async () => {
    await writeDetailedFrame('frame_001.png');
    await Fs.promises.writeFile(Path.join(frameDirectory, 'ffmpeg.log'), 'not an image');

    expect(await selectedFrameSpread()).toBeGreaterThan(20);
  });

  test('Fails when there is no frame at all', async () => {
    await expect(selector.determineBestFrame(frameDirectory)).rejects.toThrow('No selectable frame');
  });
});
