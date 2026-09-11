import Fs from 'node:fs';
import Os from 'node:os';
import Path from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { SOFTWARE } from '../../../../../../../src/plugins/official/ffmpeg/accel/Accel.js';
import type { FfmpegJob } from '../../../../../../../src/plugins/official/ffmpeg/job/FfmpegJob.js';
import type FfmpegJobRunner from '../../../../../../../src/plugins/official/ffmpeg/job/FfmpegJobRunner.js';
import TextBasedSubtitleExtractor, { type ExtractedSubtitle } from '../../../../../../../src/plugins/official/media/_old/watch/live_transcode/extractor/TextBasedSubtitleExtractor.js';
import type { ExtendedVideoAnalysis, Stream } from '../../../../../../../src/plugins/official/media/_old/video/analyser/VideoAnalyser.Types.js';

function stream(index: number, codecType: Stream['codecType'], codecName: string, tags: { [key: string]: string } = {}): Stream {
  return { index, codecType, codecName, tags } as unknown as Stream;
}

function analysis(...streams: Stream[]): ExtendedVideoAnalysis {
  return { streams } as unknown as ExtendedVideoAnalysis;
}

function target(streamIndex: number, fileName: string): ExtractedSubtitle {
  return { fileName, streamIndex, title: fileName, language: 'en', codecName: 'ass' };
}

describe('TextBasedSubtitleExtractor.planExtraction', () => {
  test('Takes ass as it is and converts every other supported text codec to it', () => {
    const plan = TextBasedSubtitleExtractor.planExtraction(analysis(
      stream(2, 'subtitle', 'ass', { language: 'jpn' }),
      stream(3, 'subtitle', 'subrip', { language: 'ger' }),
      stream(4, 'subtitle', 'webvtt', { language: 'eng' }),
    ));

    expect(plan).toEqual([
      { fileName: 'ja.2.ass', streamIndex: 2, title: 'ja', language: 'ja', codecName: 'ass' },
      { fileName: 'de.3.ass', streamIndex: 3, title: 'de', language: 'de', codecName: 'ass' },
      { fileName: 'en.4.ass', streamIndex: 4, title: 'en', language: 'en', codecName: 'ass' },
    ]);
  });

  test('Leaves image-based, unknown and non-subtitle streams alone', () => {
    const plan = TextBasedSubtitleExtractor.planExtraction(analysis(
      stream(0, 'video', 'h264'),
      stream(1, 'audio', 'aac'),
      stream(2, 'subtitle', 'hdmv_pgs_subtitle'),
      stream(3, 'subtitle', 'dvd_subtitle'),
      stream(4, 'subtitle', 'some_future_codec'),
      stream(5, 'attachment', 'ttf', { filename: 'arial.ttf' }),
    ));

    expect(plan).toEqual([]);
  });

  test('Falls back to und for a missing language tag', () => {
    expect(TextBasedSubtitleExtractor.planExtraction(analysis(stream(1, 'subtitle', 'ass')))).toEqual([
      { fileName: 'und.1.ass', streamIndex: 1, title: 'und', language: 'und', codecName: 'ass' },
    ]);
  });

  test('Keeps the stream title, without quotes', () => {
    const plan = TextBasedSubtitleExtractor.planExtraction(analysis(
      stream(1, 'subtitle', 'ass', { language: 'eng', title: 'Signs & "Songs"' }),
    ));

    expect(plan[0].title).toBe('Signs & Songs');
  });
});

describe('TextBasedSubtitleExtractor.buildArgs', () => {
  test('Writes every subtitle stream from a single demuxer', () => {
    const targets = [target(2, 'en.2.ass'), target(3, 'de.3.ass')];

    const args = TextBasedSubtitleExtractor.buildArgs('/media/in.mkv', '/tmp/subs', targets);

    expect(args).toEqual([
      '-bitexact', '-n',
      '-i', '/media/in.mkv',
      '-map', '0:2', '-c:s', 'ass', '/tmp/subs/en.2.ass',
      '-map', '0:3', '-c:s', 'ass', '/tmp/subs/de.3.ass',
    ]);
  });

  test('Keeps input options in front of the input and stays at one process for 29 streams', () => {
    const targets = Array.from({ length: 29 }, (_value, index) => target(index + 2, `en.${index + 2}.ass`));

    const args = TextBasedSubtitleExtractor.buildArgs('/media/in.mkv', '/tmp/subs', targets);

    expect(args.filter((arg) => arg === '-i')).toHaveLength(1);
    expect(args.filter((arg) => arg === '-map')).toHaveLength(29);
    expect(args.indexOf('-map')).toBeGreaterThan(args.indexOf('-i'));
    expect(new Set(args.filter((arg) => arg.endsWith('.ass'))).size).toBe(29);
  });
});

describe('TextBasedSubtitleExtractor.extract', () => {
  test('Does not touch FFmpeg for a file without text-based subtitles', async () => {
    const ffmpegJobRunner = { run: vi.fn() };
    const extractor = new TextBasedSubtitleExtractor(ffmpegJobRunner as unknown as FfmpegJobRunner);

    await expect(extractor.extract('/media/in.mkv', analysis(stream(0, 'video', 'h264')), '/tmp/does-not-exist'))
      .resolves.toEqual([]);
    expect(ffmpegJobRunner.run).not.toHaveBeenCalled();
  });
});

describe('TextBasedSubtitleExtractor.extract without a working batch', () => {
  const SUBTITLES = analysis(
    stream(1, 'subtitle', 'ass', { language: 'eng' }),
    stream(2, 'subtitle', 'ass', { language: 'ger' }),
    stream(3, 'subtitle', 'ass', { language: 'fre' }),
  );
  let targetDir: string;

  beforeEach(async () => {
    targetDir = await Fs.promises.mkdtemp(Path.join(Os.tmpdir(), 'apollo-subtitle-unit-'));
  });

  afterEach(async () => {
    await Fs.promises.rm(targetDir, { recursive: true, force: true });
  });

  /** Writes what a run covering `writableFileNames` would have written, and fails the run if it covers anything else */
  function runnerWriting(writableFileNames: readonly string[]): { run: ReturnType<typeof vi.fn> } {
    return {
      run: vi.fn(async (job: FfmpegJob<unknown>) => {
        const outputs = (await job.buildArgs(SOFTWARE)).filter((arg) => arg.endsWith('.ass'));
        const refused = outputs.filter((output) => !writableFileNames.includes(Path.basename(output)));

        await Promise.all(outputs
          .filter((output) => !refused.includes(output))
          .map((output) => Fs.promises.writeFile(output, '[Script Info]')));

        if (refused.length > 0) {
          await job.discardOutput?.();
          throw new Error(`ffmpeg refused ${refused.join(', ')}`);
        }
      }),
    };
  }

  test('Retries every stream on its own and keeps the ones that come through', async () => {
    const ffmpegJobRunner = runnerWriting(['en.1.ass', 'fr.3.ass']);
    const extractor = new TextBasedSubtitleExtractor(ffmpegJobRunner as unknown as FfmpegJobRunner);

    const extracted = await extractor.extract('/media/in.mkv', SUBTITLES, targetDir);

    expect(extracted.map((subtitle) => subtitle.fileName)).toEqual(['en.1.ass', 'fr.3.ass']);
    expect(ffmpegJobRunner.run).toHaveBeenCalledTimes(4);  // the batch, then one per stream
    await expect(Fs.promises.readdir(targetDir)).resolves.toEqual(['en.1.ass', 'fr.3.ass']);
  });

  test('Fails when not a single stream comes through', async () => {
    const extractor = new TextBasedSubtitleExtractor(runnerWriting([]) as unknown as FfmpegJobRunner);

    await expect(extractor.extract('/media/in.mkv', SUBTITLES, targetDir)).rejects.toThrow('ffmpeg refused');
  });

  test('Discards what was lying at a target path before the run', async () => {
    await Fs.promises.writeFile(Path.join(targetDir, 'de.2.ass'), 'stale');
    const extractor = new TextBasedSubtitleExtractor(runnerWriting([]) as unknown as FfmpegJobRunner);

    await expect(extractor.extract('/media/in.mkv', SUBTITLES, targetDir)).rejects.toThrow();
    await expect(Fs.promises.readdir(targetDir)).resolves.toEqual([]);
  });
});
