import FfmpegLogBuffer from '#src/plugins/official/ffmpeg/process/FfmpegLogBuffer.js';
import FfmpegLogLineParser from '#src/plugins/official/ffmpeg/process/FfmpegLogLineParser.js';

function push(logBuffer: FfmpegLogBuffer, rawLines: readonly string[]): void {
  for (const rawLine of rawLines) {
    logBuffer.push(FfmpegLogLineParser.parse(rawLine));
  }
}

function numberedLines(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => `${prefix} ${i}`);
}

describe(FfmpegLogBuffer, () => {
  describe('getTail', () => {
    test('Keeps the lines in the order they were pushed', () => {
      const logBuffer = new FfmpegLogBuffer(false);

      push(logBuffer, ['[info] one', '[info] two', '[info] three']);

      expect(logBuffer.getTail()).toBe('[info] one\n[info] two\n[info] three');
    });

    test('Keeps only the 40 most recent lines', () => {
      const logBuffer = new FfmpegLogBuffer(false);

      push(logBuffer, numberedLines('[info] line', 500));

      const tailLines = logBuffer.getTail().split('\n');
      expect(tailLines).toHaveLength(40);
      expect(tailLines.at(0)).toBe('[info] line 460');
      expect(tailLines.at(-1)).toBe('[info] line 499');
    });

    test('Is empty as long as nothing was pushed', () => {
      const logBuffer = new FfmpegLogBuffer(false);

      expect(logBuffer.getTail()).toBe('');
    });
  });

  describe('getProblems', () => {
    test('Only keeps lines of level warning or worse', () => {
      const logBuffer = new FfmpegLogBuffer(false);

      push(logBuffer, ['[info] fine', '[warning] hmm', '[debug] noise', '[error] broken', '[fatal] dead', '[verbose] chatty']);

      expect(logBuffer.getProblems()).toBe('[warning] hmm\n[error] broken\n[fatal] dead');
    });

    test('Keeps problems that already fell out of the tail', () => {
      const logBuffer = new FfmpegLogBuffer(false);

      push(logBuffer, ['[error] the actual failure reason', ...numberedLines('[debug] noise', 500)]);

      expect(logBuffer.getTail()).not.toContain('the actual failure reason');
      expect(logBuffer.getProblems()).toBe('[error] the actual failure reason');
    });

    test('Ignores lines without a level', () => {
      const logBuffer = new FfmpegLogBuffer(false);

      push(logBuffer, ['Hardware acceleration methods:']);

      expect(logBuffer.getProblems()).toBe('');
    });
  });

  describe('getFullLog', () => {
    test('Returns null when the full log is not captured', () => {
      const logBuffer = new FfmpegLogBuffer(false);

      push(logBuffer, ['[info] one']);

      expect(logBuffer.getFullLog()).toBeNull();
    });

    test('Keeps every line, even the ones that fell out of the tail', () => {
      const logBuffer = new FfmpegLogBuffer(true);

      push(logBuffer, numberedLines('[info] line', 500));

      const fullLogLines = logBuffer.getFullLog()?.split('\n');
      expect(fullLogLines).toHaveLength(500);
      expect(fullLogLines?.at(0)).toBe('[info] line 0');
    });

    test('Stops growing and marks itself truncated once it got too large', () => {
      const logBuffer = new FfmpegLogBuffer(true);
      const longLine = `[info] ${'x'.repeat(64 * 1024)}`;

      push(logBuffer, [...Array<string>(128).fill(longLine), '[error] this one no longer fits']);

      const fullLog = logBuffer.getFullLog();
      expect(fullLog).toContain('[…truncated…]');
      expect(fullLog).not.toContain('this one no longer fits');
      expect(logBuffer.getProblems()).toBe('[error] this one no longer fits');
    });
  });
});
