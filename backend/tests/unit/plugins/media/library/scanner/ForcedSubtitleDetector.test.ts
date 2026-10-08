import ForcedSubtitleDetector, {
  type SubtitleStreamCandidate,
} from '#src/plugins/official/media/library/scanner/ForcedSubtitleDetector.js';

const EPISODE_RUNTIME_IN_SEC = 1428;

function candidate(partial: Partial<SubtitleStreamCandidate> & { index: number }): SubtitleStreamCandidate {
  return {
    normalizedLanguage: 'de',
    title: '',
    forcedDisposition: false,
    eventCount: null,
    spanInSec: null,
    ...partial,
  };
}

describe(ForcedSubtitleDetector, () => {
  describe('by title', () => {
    test.for([
      { title: 'Signs' },
      { title: 'Signs & Songs [DE]' },
      { title: 'Sign/Song' },
      { title: 'Songs' },
      { title: 'Forced' },
      { title: 'English (Forced)' },
      { title: 'deutsch – signs' },
      { title: 'S&S' },
      { title: 'German S & S' },
    ])('Flags the stream titled "$title"', ({ title }) => {
      const detected = ForcedSubtitleDetector.detect([candidate({ index: 0, title })], EPISODE_RUNTIME_IN_SEC);

      expect(detected).toEqual(new Set([0]));
    });

    test.for([
      { title: 'Deutsch' },
      { title: 'English(CC)' },
      { title: 'Design' },
      { title: 'Designs' },
      { title: 'Songwriter' },
      { title: 'Unforced' },
      { title: 'Class&Subtitles' },
    ])('Does not flag the stream titled "$title"', ({ title }) => {
      const detected = ForcedSubtitleDetector.detect([candidate({ index: 0, title })], EPISODE_RUNTIME_IN_SEC);

      expect(detected).toEqual(new Set());
    });
  });

  describe('by forced disposition', () => {
    test('Trusts the disposition when the stream carries no title', () => {
      const detected = ForcedSubtitleDetector.detect([candidate({ index: 0, forcedDisposition: true })], EPISODE_RUNTIME_IN_SEC);

      expect(detected).toEqual(new Set([0]));
    });

    test('Ignores the disposition when the title describes a full stream', () => {
      const detected = ForcedSubtitleDetector.detect(
        [candidate({ index: 0, title: 'Deutsch', forcedDisposition: true })],
        EPISODE_RUNTIME_IN_SEC,
      );

      expect(detected).toEqual(new Set());
    });
  });

  describe('by event count', () => {
    test('Flags a stream with far fewer events than dialogue would need, like the 29 of a measured Signs & Songs stream', () => {
      const detected = ForcedSubtitleDetector.detect([candidate({ index: 0, eventCount: 29 })], EPISODE_RUNTIME_IN_SEC);

      expect(detected).toEqual(new Set([0]));
    });

    // 630: the full stream next to the 29-event one; 240: the sparsest full stream in the sampled library
    test.for([
      { eventCount: 630 },
      { eventCount: 240 },
    ])('Does not flag a full stream of $eventCount events', ({ eventCount }) => {
      const detected = ForcedSubtitleDetector.detect([candidate({ index: 0, eventCount })], EPISODE_RUNTIME_IN_SEC);

      expect(detected).toEqual(new Set());
    });

    test('Ignores clips too short for the rate to mean anything', () => {
      const detected = ForcedSubtitleDetector.detect([candidate({ index: 0, eventCount: 2 })], 59);

      expect(detected).toEqual(new Set());
    });
  });

  describe('by the span of its events', () => {
    test('Flags a stream whose events barely span the runtime, like a measured 22.2s of 577s', () => {
      const detected = ForcedSubtitleDetector.detect([candidate({ index: 0, spanInSec: 22.2 })], 577);

      expect(detected).toEqual(new Set([0]));
    });

    test('Does not flag a stream spanning most of the runtime', () => {
      const detected = ForcedSubtitleDetector.detect([candidate({ index: 0, spanInSec: 1428 })], EPISODE_RUNTIME_IN_SEC);

      expect(detected).toEqual(new Set());
    });

    test('Does not flag a stream spanning a third of the runtime, as short cartoons simply talk little', () => {
      const detected = ForcedSubtitleDetector.detect([candidate({ index: 0, spanInSec: 398 })], 1234);

      expect(detected).toEqual(new Set());
    });
  });

  describe('compared with the other streams', () => {
    test('Flags the one of two same-language streams whose events span far less of the runtime', () => {
      const detected = ForcedSubtitleDetector.detect([
        candidate({ index: 0, normalizedLanguage: 'es', spanInSec: 5364 }),
        candidate({ index: 1, normalizedLanguage: 'es', spanInSec: 329 }),
      ], 5692);

      expect(detected).toEqual(new Set([1]));
    });

    test('Flags the one of two same-language streams with far fewer events', () => {
      const detected = ForcedSubtitleDetector.detect([
        candidate({ index: 0, normalizedLanguage: 'de', eventCount: 820 }),
        candidate({ index: 1, normalizedLanguage: 'de', eventCount: 66 }),
      ], EPISODE_RUNTIME_IN_SEC);

      expect(detected).toEqual(new Set([1]));
    });

    test('Does not flag same-language streams that only differ slightly, like English next to English(CC)', () => {
      const detected = ForcedSubtitleDetector.detect([
        candidate({ index: 0, normalizedLanguage: 'en', title: 'English', eventCount: 256 }),
        candidate({ index: 1, normalizedLanguage: 'en', title: 'English(CC)', eventCount: 420 }),
      ], EPISODE_RUNTIME_IN_SEC);

      expect(detected).toEqual(new Set());
    });

    test('Does not compare against a same-language stream that itself spans less than half of the runtime', () => {
      const detected = ForcedSubtitleDetector.detect([
        candidate({ index: 0, normalizedLanguage: 'de', spanInSec: 450 }),
        candidate({ index: 1, normalizedLanguage: 'de', spanInSec: 105 }),
      ], 1000);

      expect(detected).toEqual(new Set());
    });

    test('Flags neither of two same-language streams that metadata alone cannot tell apart', () => {
      const detected = ForcedSubtitleDetector.detect([
        candidate({ index: 3, spanInSec: 1428.631 }),
        candidate({ index: 4, spanInSec: 1428.631 }),
      ], EPISODE_RUNTIME_IN_SEC);

      expect(detected).toEqual(new Set());
    });

    test('Does not compare streams of different languages', () => {
      const detected = ForcedSubtitleDetector.detect([
        candidate({ index: 0, normalizedLanguage: 'de', spanInSec: 1400 }),
        candidate({ index: 1, normalizedLanguage: 'fr', spanInSec: 300 }),
      ], EPISODE_RUNTIME_IN_SEC);

      expect(detected).toEqual(new Set());
    });

    test('Does not compare streams that merely share an unknown language', () => {
      const detected = ForcedSubtitleDetector.detect([
        candidate({ index: 0, normalizedLanguage: 'und', spanInSec: 1400 }),
        candidate({ index: 1, normalizedLanguage: 'und', spanInSec: 300 }),
      ], EPISODE_RUNTIME_IN_SEC);

      expect(detected).toEqual(new Set());
    });
  });
});
