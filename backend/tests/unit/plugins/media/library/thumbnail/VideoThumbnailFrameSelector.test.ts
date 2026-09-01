import Fs from 'node:fs';
import Os from 'node:os';
import Path from 'node:path';
import Sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import ThumbnailFrameRater from '../../../../../../src/plugins/official/media/library/thumbnail/ThumbnailFrameRater.js';
import VideoThumbnailFrameSelector from '../../../../../../src/plugins/official/media/library/thumbnail/VideoThumbnailFrameSelector.js';

let frameDirectory: string;
let selector: VideoThumbnailFrameSelector;

beforeEach(async () => {
  frameDirectory = await Fs.promises.mkdtemp(Path.join(Os.tmpdir(), 'thumbnail-frame-selector-'));
  framePaths.length = 0;
  selector = new VideoThumbnailFrameSelector(new ThumbnailFrameRater());
});

afterEach(async () => {
  await Fs.promises.rm(frameDirectory, { recursive: true, force: true });
});

const framePaths: string[] = [];

async function writeSolidFrame(fileName: string, grey: number): Promise<void> {
  const framePath = Path.join(frameDirectory, fileName);
  await Sharp({ create: { width: 64, height: 64, channels: 3, background: { r: grey, g: grey, b: grey } } })
    .png()
    .toFile(framePath);
  framePaths.push(framePath);
}

async function writeDetailedFrame(fileName: string): Promise<void> {
  const framePath = Path.join(frameDirectory, fileName);
  await Sharp({ create: { width: 64, height: 64, channels: 3, background: { r: 0, g: 0, b: 0 }, noise: { type: 'gaussian', mean: 128, sigma: 60 } } })
    .png()
    .toFile(framePath);
  framePaths.push(framePath);
}

async function selectedFrameSpread(): Promise<number> {
  const stats = await (await selector.selectBestFrame(framePaths)).stats();
  return stats.channels[0].stdev;
}

describe('VideoThumbnailFrameSelector#selectBestFrame', () => {
  test.each([
    ['a black frame', 0],
    ['a blown out frame', 255],
    ['a flat mid-grey frame', 128],
  ])('Skips %s in favour of a usable one', async (_name: string, grey: number) => {
    await writeSolidFrame('frame_001.png', grey);
    await writeDetailedFrame('frame_002.png');

    expect(await selectedFrameSpread()).toBeGreaterThan(20);
  });

  test('Falls back to the least bad frame when every candidate is unusable, and says so', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await writeSolidFrame('frame_001.png', 0);
    await writeSolidFrame('frame_002.png', 255);

    await expect(selector.selectBestFrame(framePaths)).resolves.toBeDefined();
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('picking the least bad one'));
  });

  test('Fails when there is no frame at all', async () => {
    await expect(selector.selectBestFrame([])).rejects.toThrow('No candidate frame');
  });
});
