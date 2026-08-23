import { describe, expect, test } from 'vitest';
import FfmpegLogLineParser from '../../../../../src/plugins/official/ffmpeg/process/FfmpegLogLineParser.js';

describe('FfmpegLogLineParser#parse', () => {
  test('Parses a line that only has a level prefix', () => {
    const logLine = FfmpegLogLineParser.parse('[info] Stream mapping:');

    expect(logLine.level).toBe('info');
    expect(logLine.component).toBeNull();
    expect(logLine.message).toBe('Stream mapping:');
  });

  test('Parses a line that has a component and a level prefix', () => {
    const logLine = FfmpegLogLineParser.parse('[libx264 @ 0x55a447472940] [info] using SAR=1/1');

    expect(logLine.level).toBe('info');
    expect(logLine.component).toBe('libx264');
    expect(logLine.message).toBe('using SAR=1/1');
  });

  test('Parses a component name containing brackets-free special characters', () => {
    const logLine = FfmpegLogLineParser.parse('[out#0/null @ 0x55a447471fc0] [error] boom');

    expect(logLine.component).toBe('out#0/null');
    expect(logLine.message).toBe('boom');
  });

  test('Parses the prefixes in either order', () => {
    const logLine = FfmpegLogLineParser.parse('[warning] [mov,mp4 @ 0x1234abcd] something odd');

    expect(logLine.level).toBe('warning');
    expect(logLine.component).toBe('mov,mp4');
    expect(logLine.message).toBe('something odd');
  });

  test('Keeps a message that starts with an unrecognized bracket group intact', () => {
    const logLine = FfmpegLogLineParser.parse('[debug] [Parsed_select_0] t:1.5 -> select:1.0');

    expect(logLine.level).toBe('debug');
    expect(logLine.component).toBeNull();
    expect(logLine.message).toBe('[Parsed_select_0] t:1.5 -> select:1.0');
  });

  test('Handles a line without any prefix', () => {
    const logLine = FfmpegLogLineParser.parse('Hardware acceleration methods:');

    expect(logLine.level).toBeNull();
    expect(logLine.component).toBeNull();
    expect(logLine.message).toBe('Hardware acceleration methods:');
  });

  test('Keeps the raw line', () => {
    const raw = '[libx264 @ 0x55a447472940] [info] using SAR=1/1';
    expect(FfmpegLogLineParser.parse(raw).raw).toBe(raw);
  });
});

describe('FfmpegLogLineParser#isProblem', () => {
  test.each(['panic', 'fatal', 'error', 'warning'])('Treats %s as a problem', (level) => {
    expect(FfmpegLogLineParser.isProblem(FfmpegLogLineParser.parse(`[${level}] uh oh`))).toBe(true);
  });

  test.each(['info', 'verbose', 'debug', 'trace'])('Does not treat %s as a problem', (level) => {
    expect(FfmpegLogLineParser.isProblem(FfmpegLogLineParser.parse(`[${level}] all good`))).toBe(false);
  });

  test('Does not treat a line without a level as a problem', () => {
    expect(FfmpegLogLineParser.isProblem(FfmpegLogLineParser.parse('no prefix here'))).toBe(false);
  });
});
