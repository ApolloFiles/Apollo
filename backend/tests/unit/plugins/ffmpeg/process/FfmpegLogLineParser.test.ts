import FfmpegLogLineParser from '#src/plugins/official/ffmpeg/process/FfmpegLogLineParser.js';

describe(FfmpegLogLineParser, () => {
  describe(FfmpegLogLineParser.parse, () => {
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

    test('Parses a component name that contains special characters', () => {
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

    test('Takes a line without any prefix as the message', () => {
      const logLine = FfmpegLogLineParser.parse('Hardware acceleration methods:');

      expect(logLine.level).toBeNull();
      expect(logLine.component).toBeNull();
      expect(logLine.message).toBe('Hardware acceleration methods:');
    });

    test('Keeps the raw line', () => {
      const logLine = FfmpegLogLineParser.parse('[libx264 @ 0x55a447472940] [info] using SAR=1/1');

      expect(logLine.raw).toBe('[libx264 @ 0x55a447472940] [info] using SAR=1/1');
    });
  });

  describe(FfmpegLogLineParser.isProblem, () => {
    test.for([
      { level: 'panic' },
      { level: 'fatal' },
      { level: 'error' },
      { level: 'warning' },
    ])('Treats $level as a problem', ({ level }) => {
      const logLine = FfmpegLogLineParser.parse(`[${level}] uh oh`);

      expect(FfmpegLogLineParser.isProblem(logLine)).toBe(true);
    });

    test.for([
      { level: 'info' },
      { level: 'verbose' },
      { level: 'debug' },
      { level: 'trace' },
    ])('Does not treat $level as a problem', ({ level }) => {
      const logLine = FfmpegLogLineParser.parse(`[${level}] all good`);

      expect(FfmpegLogLineParser.isProblem(logLine)).toBe(false);
    });

    test('Does not treat a line without a level as a problem', () => {
      const logLine = FfmpegLogLineParser.parse('no prefix here');

      expect(FfmpegLogLineParser.isProblem(logLine)).toBe(false);
    });
  });
});
