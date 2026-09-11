import Fs from 'node:fs';
import Os from 'node:os';
import Path from 'node:path';
import { container } from 'tsyringe';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import FfmpegProcessRunner from '../../../../../src/plugins/official/ffmpeg/process/FfmpegProcessRunner.js';
import FontExtractor from '../../../../../src/plugins/official/media/_old/watch/live_transcode/extractor/FontExtractor.js';
import TextBasedSubtitleExtractor from '../../../../../src/plugins/official/media/_old/watch/live_transcode/extractor/TextBasedSubtitleExtractor.js';
import VideoAnalyser from '../../../../../src/plugins/official/media/_old/video/analyser/VideoAnalyser.js';
import { ffmpegEnvironment, requireSample } from '../../ffmpeg/FfmpegTestEnvironment.js';

let targetDir: string;

beforeEach(async () => {
  targetDir = await Fs.promises.mkdtemp(Path.join(Os.tmpdir(), 'apollo-subtitle-acceptance-'));
});

afterEach(async () => {
  await Fs.promises.rm(targetDir, { recursive: true, force: true });
});

describe('TextBasedSubtitleExtractor', () => {
  test('Extracts every text-based subtitle stream with a single ffmpeg process', async (ctx) => {
    const sample = requireSample(ctx, ffmpegEnvironment().multiSubtitleSample, 'a file with multiple subtitle streams');
    const spawn = vi.spyOn(FfmpegProcessRunner.prototype, 'spawn');

    const extracted = await container.resolve(TextBasedSubtitleExtractor)
      .extract(sample.path, await VideoAnalyser.analyze(sample.path, true), targetDir);

    expect(spawn).toHaveBeenCalledTimes(1);
    expect(extracted).toEqual([
      { fileName: 'en.1.ass', streamIndex: 1, title: 'English', language: 'en', codecName: 'ass' },
      { fileName: 'de.2.ass', streamIndex: 2, title: 'de', language: 'de', codecName: 'ass' },
      { fileName: 'fr.3.ass', streamIndex: 3, title: 'fr', language: 'fr', codecName: 'ass' },
      { fileName: 'und.4.ass', streamIndex: 4, title: 'und', language: 'und', codecName: 'ass' },
    ]);
  });

  test('Converts every one of them into a subtitle file the player can read', async (ctx) => {
    const sample = requireSample(ctx, ffmpegEnvironment().multiSubtitleSample, 'a file with multiple subtitle streams');

    const extracted = await container.resolve(TextBasedSubtitleExtractor)
      .extract(sample.path, await VideoAnalyser.analyze(sample.path, true), targetDir);

    for (let index = 0; index < extracted.length; ++index) {
      const fileContent = await Fs.promises.readFile(Path.join(targetDir, extracted[index].fileName), 'utf-8');

      expect(fileContent).toMatch(/^\[Script Info]/);
      expect(fileContent).toContain(sample.firstCues[index]);
      expect(fileContent).toContain(sample.lastCue);
    }
  });

  test('Never hands the player what was lying at a target path before', async (ctx) => {
    const sample = requireSample(ctx, ffmpegEnvironment().multiSubtitleSample, 'a file with multiple subtitle streams');
    await Fs.promises.writeFile(Path.join(targetDir, 'fr.3.ass'), 'stale subtitles of an entirely different file');

    const extracted = await container.resolve(TextBasedSubtitleExtractor)
      .extract(sample.path, await VideoAnalyser.analyze(sample.path, true), targetDir);

    expect(extracted).toHaveLength(sample.subtitleStreamIndices.length);
    const staleTarget = await Fs.promises.readFile(Path.join(targetDir, 'fr.3.ass'), 'utf-8');
    expect(staleTarget).not.toContain('stale subtitles');
    expect(staleTarget).toContain(sample.firstCues[2]);
  });
});

describe('FontExtractor', () => {
  test('Dumps every attached font with a single ffmpeg process', async (ctx) => {
    const sample = requireSample(ctx, ffmpegEnvironment().multiSubtitleSample, 'a file with an attached font');
    const spawn = vi.spyOn(FfmpegProcessRunner.prototype, 'spawn');

    const extracted = await container.resolve(FontExtractor)
      .extract(sample.path, await VideoAnalyser.analyze(sample.path, true), targetDir);

    expect(spawn).toHaveBeenCalledTimes(1);
    expect(extracted).toEqual([{ fileName: sample.attachedFontFileName, streamIndex: 5, byteSize: 512 }]);
    await expect(Fs.promises.readFile(Path.join(targetDir, sample.attachedFontFileName)))
      .resolves.toEqual(Buffer.alloc(512, 0x2a));
  });
});
