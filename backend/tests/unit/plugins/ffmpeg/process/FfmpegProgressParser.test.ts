import { describe, expect, test } from 'vitest';
import FfmpegProgressParser, { type FfmpegProgress } from '../../../../../src/plugins/official/ffmpeg/process/FfmpegProgressParser.js';

function consumeBlock(parser: FfmpegProgressParser, lines: string[]): FfmpegProgress | null {
  let lastProgress: FfmpegProgress | null = null;
  for (const line of lines) {
    lastProgress = parser.consumeLine(line) ?? lastProgress;
  }
  return lastProgress;
}

const COMPLETE_BLOCK = [
  'frame=75',
  'fps=24.50',
  'stream_0_0_q=-1.0',
  'bitrate=  32.0kbits/s',
  'total_size=123456',
  'out_time_us=2920000',
  'out_time_ms=2920000',
  'out_time=00:00:02.920000',
  'dup_frames=1',
  'drop_frames=2',
  'speed=31.9x',
  'progress=continue',
];

describe('FfmpegProgressParser#consumeLine', () => {
  test('Emits nothing until the progress line completes the block', () => {
    const parser = new FfmpegProgressParser();

    for (const line of COMPLETE_BLOCK.slice(0, -1)) {
      expect(parser.consumeLine(line)).toBeNull();
    }
    expect(parser.consumeLine('progress=continue')).not.toBeNull();
  });

  test('Parses a complete block', () => {
    const progress = consumeBlock(new FfmpegProgressParser(), COMPLETE_BLOCK);

    expect(progress).toEqual({
      frame: 75,
      fps: 24.5,
      bitrateInKilobitsPerSecond: 32,
      totalSizeInBytes: 123456,
      outTimeInMillis: 2920,
      duplicatedFrames: 1,
      droppedFrames: 2,
      speed: 31.9,
      finished: false,
    } satisfies FfmpegProgress);
  });

  test('Marks the last block of a run as finished', () => {
    const progress = consumeBlock(new FfmpegProgressParser(), ['frame=75', 'progress=end']);
    expect(progress?.finished).toBe(true);
  });

  test("Treats 'N/A' values as unknown", () => {
    const progress = consumeBlock(new FfmpegProgressParser(), [
      'bitrate=N/A',
      'total_size=N/A',
      'out_time_us=N/A',
      'speed=N/A',
      'progress=continue',
    ]);

    expect(progress?.bitrateInKilobitsPerSecond).toBeNull();
    expect(progress?.totalSizeInBytes).toBeNull();
    expect(progress?.outTimeInMillis).toBeNull();
    expect(progress?.speed).toBeNull();
  });

  test('Reports fields missing from the block as unknown', () => {
    const progress = consumeBlock(new FfmpegProgressParser(), ['progress=continue']);

    expect(progress).toEqual({
      frame: null,
      fps: null,
      bitrateInKilobitsPerSecond: null,
      totalSizeInBytes: null,
      outTimeInMillis: null,
      duplicatedFrames: null,
      droppedFrames: null,
      speed: null,
      finished: false,
    } satisfies FfmpegProgress);
  });

  test('Does not carry fields over into the next block', () => {
    const parser = new FfmpegProgressParser();

    consumeBlock(parser, COMPLETE_BLOCK);
    const secondProgress = consumeBlock(parser, ['frame=100', 'progress=end']);

    expect(secondProgress?.frame).toBe(100);
    expect(secondProgress?.speed).toBeNull();
  });

  test('Ignores lines that are not key-value pairs', () => {
    expect(new FfmpegProgressParser().consumeLine('')).toBeNull();
  });
});
