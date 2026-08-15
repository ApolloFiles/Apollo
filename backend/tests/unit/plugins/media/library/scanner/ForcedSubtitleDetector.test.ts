import { describe, expect, test } from 'vitest';
import ForcedSubtitleDetector, {
  type SubtitleStreamCandidate,
} from '../../../../../../src/plugins/official/media/library/scanner/ForcedSubtitleDetector.js';

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

describe('ForcedSubtitleDetector#detect (titles)', () => {
  test.each([
    'Signs',
    'Signs & Songs [DE]',
    'Sign/Song',
    'Songs',
    'Forced',
    'English (Forced)',
    'deutsch – signs',
    'S&S',
    'German S & S',
  ])('Flags the stream titled %j', (title) => {
    const detected = ForcedSubtitleDetector.detect([candidate({ index: 0, title })], EPISODE_RUNTIME_IN_SEC);
    expect(detected).toEqual(new Set([0]));
  });

  test.each([
    'Deutsch',
    'English(CC)',
    'Design',
    'Designs',
    'Songwriter',
    'Unforced',
    'Class&Subtitles',
  ])('Does not flag the stream titled %j', (title) => {
    const detected = ForcedSubtitleDetector.detect([candidate({ index: 0, title })], EPISODE_RUNTIME_IN_SEC);
    expect(detected).toEqual(new Set());
  });
});

describe('ForcedSubtitleDetector#detect (forced disposition)', () => {
  test('Trusts the disposition when the stream carries no title', () => {
    const detected = ForcedSubtitleDetector.detect(
      [candidate({ index: 0, forcedDisposition: true })],
      EPISODE_RUNTIME_IN_SEC,
    );
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

describe('ForcedSubtitleDetector#detect (event count)', () => {
  test('Flags a stream with far fewer events than dialogue would need', () => {
    // measured on 'Saga of Tanya the Evil' S01E01: 29 events for a 'Signs & Songs' stream
    const detected = ForcedSubtitleDetector.detect(
      [candidate({ index: 0, eventCount: 29 })],
      EPISODE_RUNTIME_IN_SEC,
    );
    expect(detected).toEqual(new Set([0]));
  });

  test('Does not flag a full stream', () => {
    // measured on the same file: 630 events for the full stream, and 240 events is the sparsest
    // full stream found across the sampled library
    for (const eventCount of [630, 240]) {
      const detected = ForcedSubtitleDetector.detect(
        [candidate({ index: 0, eventCount })],
        EPISODE_RUNTIME_IN_SEC,
      );
      expect(detected, `eventCount=${eventCount}`).toEqual(new Set());
    }
  });

  test('Ignores clips too short for the rate to mean anything', () => {
    const detected = ForcedSubtitleDetector.detect([candidate({ index: 0, eventCount: 2 })], 59);
    expect(detected).toEqual(new Set());
  });
});

describe('ForcedSubtitleDetector#detect (span)', () => {
  test('Flags a stream whose events barely span the runtime', () => {
    // measured on 'Der Raub der Frühlingsgöttin': 22.2s of a 577s runtime
    const detected = ForcedSubtitleDetector.detect(
      [candidate({ index: 0, spanInSec: 22.2 })],
      577,
    );
    expect(detected).toEqual(new Set([0]));
  });

  test('Does not flag a stream spanning most of the runtime', () => {
    const detected = ForcedSubtitleDetector.detect(
      [candidate({ index: 0, spanInSec: 1428 })],
      EPISODE_RUNTIME_IN_SEC,
    );
    expect(detected).toEqual(new Set());
  });

  test('Does not flag a sparse-but-not-tiny stream on its own', () => {
    // 'Der Drache wider Willen' has four languages at ~32% – short cartoons simply talk little
    const detected = ForcedSubtitleDetector.detect(
      [candidate({ index: 0, spanInSec: 398 })],
      1234,
    );
    expect(detected).toEqual(new Set());
  });
});

describe('ForcedSubtitleDetector#detect (same-language comparison)', () => {
  test('Flags the much smaller of two same-language streams', () => {
    // measured on 'Professor Layton und die ewige Diva': 5364s vs 329s of a 5692s runtime
    const detected = ForcedSubtitleDetector.detect([
      candidate({ index: 0, normalizedLanguage: 'es', spanInSec: 5364 }),
      candidate({ index: 1, normalizedLanguage: 'es', spanInSec: 329 }),
    ], 5692);
    expect(detected).toEqual(new Set([1]));
  });

  test('Compares event counts as well', () => {
    const detected = ForcedSubtitleDetector.detect([
      candidate({ index: 0, normalizedLanguage: 'de', eventCount: 820 }),
      candidate({ index: 1, normalizedLanguage: 'de', eventCount: 66 }),
    ], EPISODE_RUNTIME_IN_SEC);
    expect(detected).toEqual(new Set([1]));
  });

  test('Does not compare streams of different languages', () => {
    const detected = ForcedSubtitleDetector.detect([
      candidate({ index: 0, normalizedLanguage: 'de', spanInSec: 1400 }),
      candidate({ index: 1, normalizedLanguage: 'fr', spanInSec: 300 }),
    ], EPISODE_RUNTIME_IN_SEC);
    expect(detected).toEqual(new Set());
  });

  test('Does not compare streams that merely share an unknown language', () => {
    // 'und' groups streams by the *absence* of a language – they are usually different languages
    const detected = ForcedSubtitleDetector.detect([
      candidate({ index: 0, normalizedLanguage: 'und', spanInSec: 1400 }),
      candidate({ index: 1, normalizedLanguage: 'und', spanInSec: 300 }),
    ], EPISODE_RUNTIME_IN_SEC);
    expect(detected).toEqual(new Set());
  });

  test('Does not flag streams that only differ slightly', () => {
    // measured on 'Let You Down': 'English' (256 events) next to 'English(CC)' (420 events)
    const detected = ForcedSubtitleDetector.detect([
      candidate({ index: 0, normalizedLanguage: 'en', title: 'English', eventCount: 256 }),
      candidate({ index: 1, normalizedLanguage: 'en', title: 'English(CC)', eventCount: 420 }),
    ], EPISODE_RUNTIME_IN_SEC);
    expect(detected).toEqual(new Set());
  });

  test('Does not compare against a reference stream that is itself tiny', () => {
    // index 1 spans only 23% of index 1 – but index 0 covers less than half of the runtime and is
    // therefore no evidence of what a full stream would look like for this file
    const detected = ForcedSubtitleDetector.detect([
      candidate({ index: 0, normalizedLanguage: 'de', spanInSec: 450 }),
      candidate({ index: 1, normalizedLanguage: 'de', spanInSec: 105 }),
    ], 1000);
    expect(detected).toEqual(new Set());
  });
});

describe('ForcedSubtitleDetector#detect (real-world files)', () => {
  test('Flags nothing when two same-language streams are indistinguishable', () => {
    // an untagged Blu-ray remux: both streams carry no title, no forced disposition and span the
    // full runtime, and the muxer wrote no statistics tags either – only counting the actual
    // subtitle events could tell them apart, which is far too expensive for a library scan
    const detected = ForcedSubtitleDetector.detect([
      candidate({ index: 3, spanInSec: 1428.631 }),
      candidate({ index: 4, spanInSec: 1428.631 }),
    ], EPISODE_RUNTIME_IN_SEC);
    expect(detected).toEqual(new Set());
  });
});
