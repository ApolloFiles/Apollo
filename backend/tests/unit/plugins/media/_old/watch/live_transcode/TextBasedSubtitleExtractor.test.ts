import { describe, expect, test, vi } from 'vitest';
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
      '-fix_sub_duration',
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
    expect(args.indexOf('-fix_sub_duration')).toBeLessThan(args.indexOf('-i'));
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
