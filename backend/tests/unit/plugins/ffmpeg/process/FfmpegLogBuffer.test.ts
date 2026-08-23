import { describe, expect, test } from 'vitest';
import FfmpegLogBuffer from '../../../../../src/plugins/official/ffmpeg/process/FfmpegLogBuffer.js';
import FfmpegLogLineParser from '../../../../../src/plugins/official/ffmpeg/process/FfmpegLogLineParser.js';

function push(logBuffer: FfmpegLogBuffer, ...rawLines: string[]): void {
  for (const rawLine of rawLines) {
    logBuffer.push(FfmpegLogLineParser.parse(rawLine));
  }
}

describe('FfmpegLogBuffer#getTail', () => {
  test('Keeps the lines in the order they were pushed', () => {
    const logBuffer = new FfmpegLogBuffer(false);

    push(logBuffer, '[info] one', '[info] two', '[info] three');

    expect(logBuffer.getTail()).toBe('[info] one\n[info] two\n[info] three');
  });

  test('Drops the oldest lines once the buffer is full', () => {
    const logBuffer = new FfmpegLogBuffer(false);

    for (let i = 0; i < 500; ++i) {
      push(logBuffer, `[info] line ${i}`);
    }

    const tailLines = logBuffer.getTail().split('\n');
    expect(tailLines.at(0)).not.toBe('[info] line 0');
    expect(tailLines.at(-1)).toBe('[info] line 499');
    expect(tailLines.length).toBeLessThan(500);
  });

  test('Is empty as long as nothing was pushed', () => {
    expect(new FfmpegLogBuffer(false).getTail()).toBe('');
  });
});

describe('FfmpegLogBuffer#getProblems', () => {
  test('Only keeps lines of level warning or worse', () => {
    const logBuffer = new FfmpegLogBuffer(false);

    push(logBuffer, '[info] fine', '[warning] hmm', '[debug] noise', '[error] broken', '[fatal] dead', '[verbose] chatty');

    expect(logBuffer.getProblems()).toBe('[warning] hmm\n[error] broken\n[fatal] dead');
  });

  test('Keeps problems that already fell out of the tail', () => {
    const logBuffer = new FfmpegLogBuffer(false);

    push(logBuffer, '[error] the actual failure reason');
    for (let i = 0; i < 500; ++i) {
      push(logBuffer, `[debug] noise ${i}`);
    }

    expect(logBuffer.getTail()).not.toContain('the actual failure reason');
    expect(logBuffer.getProblems()).toContain('the actual failure reason');
  });

  test('Ignores lines without a level', () => {
    const logBuffer = new FfmpegLogBuffer(false);

    push(logBuffer, 'Hardware acceleration methods:');

    expect(logBuffer.getProblems()).toBe('');
  });
});

describe('FfmpegLogBuffer#getFullLog', () => {
  test('Returns null when the full log is not captured', () => {
    const logBuffer = new FfmpegLogBuffer(false);

    push(logBuffer, '[info] one');

    expect(logBuffer.getFullLog()).toBeNull();
  });

  test('Keeps every line, even the ones that fell out of the tail', () => {
    const logBuffer = new FfmpegLogBuffer(true);

    for (let i = 0; i < 500; ++i) {
      push(logBuffer, `[info] line ${i}`);
    }

    expect(logBuffer.getFullLog()?.split('\n')).toHaveLength(500);
    expect(logBuffer.getFullLog()).toContain('[info] line 0');
  });

  test('Stops growing and marks itself truncated once it got too large', () => {
    const logBuffer = new FfmpegLogBuffer(true);
    const longLine = `[info] ${'x'.repeat(64 * 1024)}`;

    for (let i = 0; i < 128; ++i) {
      push(logBuffer, longLine);
    }
    push(logBuffer, '[error] this one no longer fits');

    const fullLog = logBuffer.getFullLog() ?? '';
    expect(fullLog).toContain('[…truncated…]');
    expect(fullLog).not.toContain('this one no longer fits');
    expect(logBuffer.getProblems()).toContain('this one no longer fits');
  });
});
