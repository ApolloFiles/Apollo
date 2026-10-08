import Fs from 'node:fs';
import Os from 'node:os';
import Path from 'node:path';
import Sharp, { type SharpOptions } from 'sharp';
import ThumbnailFrameRater from '#src/plugins/official/media/library/thumbnail/ThumbnailFrameRater.js';
import VideoThumbnailFrameSelector from '#src/plugins/official/media/library/thumbnail/VideoThumbnailFrameSelector.js';

describe(VideoThumbnailFrameSelector, () => {
  let frameDirectory: string;
  let selector: VideoThumbnailFrameSelector;

  beforeEach(async () => {
    frameDirectory = await Fs.promises.mkdtemp(Path.join(Os.tmpdir(), 'thumbnail-frame-selector-'));
    selector = new VideoThumbnailFrameSelector(new ThumbnailFrameRater());
  });

  afterEach(async () => {
    await Fs.promises.rm(frameDirectory, { recursive: true, force: true });
  });

  async function writeFrame(fileName: string, create: SharpOptions['create']): Promise<string> {
    const framePath = Path.join(frameDirectory, fileName);
    await Sharp({ create }).png().toFile(framePath);
    return framePath;
  }

  function writeSolidFrame(fileName: string, grey: number): Promise<string> {
    return writeFrame(fileName, { width: 64, height: 64, channels: 3, background: { r: grey, g: grey, b: grey } });
  }

  function writeNoisyFrame(fileName: string, mean: number, sigma: number): Promise<string> {
    return writeFrame(fileName, { width: 64, height: 64, channels: 3, background: { r: 0, g: 0, b: 0 }, noise: { type: 'gaussian', mean, sigma } });
  }

  test.for([
    { name: 'a black frame', grey: 0 },
    { name: 'a blown out frame', grey: 255 },
    { name: 'a flat mid-grey frame', grey: 128 },
  ])('Skips $name in favour of a usable one', async ({ grey }) => {
    const framePaths = [await writeSolidFrame('frame_001.png', grey), await writeNoisyFrame('frame_002.png', 128, 60)];

    const selected = await selector.selectBestFrame(framePaths);

    expect((await selected.stats()).channels[0].stdev).toBeGreaterThan(20);
  });

  describe('when every candidate is unusable', () => {
    let warn: ReturnType<typeof vi.spyOn>;
    let framePaths: string[];

    beforeEach(async () => {
      warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      framePaths = [await writeSolidFrame('frame_001.png', 0), await writeNoisyFrame('frame_002.png', 250, 3)];
    });

    test('Falls back to the least bad frame', async () => {
      const selected = await selector.selectBestFrame(framePaths);

      expect((await selected.stats()).channels[0].mean).toBeGreaterThan(200);
    });

    test('Says that it fell back', async () => {
      await selector.selectBestFrame(framePaths);

      expect(warn).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('picking the least bad one'));
    });
  });

  test('Fails when there is no frame at all', async () => {
    await expect(selector.selectBestFrame([])).rejects.toThrow('No candidate frame');
  });
});
