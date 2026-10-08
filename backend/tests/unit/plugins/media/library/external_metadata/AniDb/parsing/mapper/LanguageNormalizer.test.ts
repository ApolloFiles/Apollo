import {
  LanguageNormalizer,
} from '#src/plugins/official/media/library/external_metadata/AniDb/parsing/mapper/LanguageNormalizer.js';

describe(LanguageNormalizer, () => {
  let normalizer: LanguageNormalizer;

  beforeEach(() => {
    normalizer = new LanguageNormalizer();
  });

  test.for([
    { raw: 'ja' },
    { raw: 'en' },
    { raw: 'de' },
    { raw: 'pt-BR' },
    { raw: 'es-419' },
  ])('Passes the standard language code $raw through', ({ raw }) => {
    expect(normalizer.normalize(raw)).toEqual({ raw, bcp47: raw });
  });

  test.for([
    { raw: 'x-jat', bcp47: 'ja-Latn' },
    { raw: 'es-CA', bcp47: 'ca' },
    { raw: 'es-PV', bcp47: 'eu' },
    { raw: 'bd', bcp47: 'bn' },
    { raw: 'my', bcp47: 'ms' },
    { raw: 'bur', bcp47: 'my' },
    { raw: 'al', bcp47: 'sq' },
    { raw: 'tl', bcp47: 'fil' },
    { raw: 'zh-nan', bcp47: 'zh-Hant-TW' },
    { raw: 'x-unk', bcp47: 'und' },
  ])('Translates the AniDB-specific code $raw to $bcp47', ({ raw, bcp47 }) => {
    expect(normalizer.normalize(raw)).toEqual({ raw, bcp47 });
  });

  test.for([
    { raw: 'bs' },
    { raw: 'xx-YY' },
    { raw: '' },
  ])('Leaves the unknown or unverified code "$raw" without a BCP 47 tag', ({ raw }) => {
    expect(normalizer.normalize(raw)).toEqual({ raw, bcp47: null });
  });

  test('Does not resolve object prototype keys as language codes', () => {
    expect(normalizer.normalize('constructor')).toEqual({ raw: 'constructor', bcp47: null });
  });
});
