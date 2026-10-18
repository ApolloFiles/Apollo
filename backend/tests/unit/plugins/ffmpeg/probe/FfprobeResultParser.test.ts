import type { MockInstance } from 'vitest';
import { ZodError } from 'zod';
import { FfprobeResultParser } from '#src/plugins/official/ffmpeg/probe/FfprobeResultParser.js';
import { ARRIVAL_PATH, arrivalFormat, arrivalFullProbe } from './FfprobeOutputs.js';

describe(FfprobeResultParser, () => {
  let parser: FfprobeResultParser;

  beforeEach(() => {
    parser = new FfprobeResultParser();
  });

  describe('parseFull', () => {
    test('Turns the 0/1 dispositions ffprobe prints into booleans', () => {
      const parsed = parser.parseFull(arrivalFullProbe());

      expect(parsed.streams[1].disposition).toEqual({ default: false, dub: true, forced: false });
    });

    test('Gives a stream without tags an empty tag map', () => {
      const parsed = parser.parseFull(arrivalFullProbe());

      expect(parsed.streams[1].tags).toEqual({});
    });

    test('Rejects the output of a format probe, which has no streams', () => {
      expect(() => parser.parseFull({ format: arrivalFormat() })).toThrow(ZodError);
    });
  });

  describe('parseFormat', () => {
    test('Keeps only the format section of a full probe', () => {
      const parsed = parser.parseFormat(arrivalFullProbe());

      expect(Object.keys(parsed)).toEqual(['format']);
      expect(parsed.format.format_name).toBe('matroska,webm');
    });
  });

  describe('logUnknownKeys', () => {
    let consoleWarn: MockInstance<typeof console.warn>;

    beforeEach(() => {
      consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    });

    test('Warns with the file and the path of each key the schema does not know', () => {
      const raw = arrivalFullProbe();
      raw.format = { ...arrivalFormat(), probe_extension: 'mkv' };

      parser.logUnknownKeys(ARRIVAL_PATH, raw, parser.parseFull(raw));

      expect(consoleWarn).toHaveBeenCalledExactlyOnceWith(expect.stringContaining(ARRIVAL_PATH));
      expect(consoleWarn).toHaveBeenCalledWith(expect.stringContaining('format.probe_extension'));
    });

    test('Stays silent when the schema knows every key', () => {
      const raw = arrivalFullProbe();

      parser.logUnknownKeys(ARRIVAL_PATH, raw, parser.parseFull(raw));

      expect(consoleWarn).not.toHaveBeenCalled();
    });
  });
});
