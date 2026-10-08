import { LanguageNormalizer } from '#src/plugins/official/media/library/external_metadata/AniDb/parsing/mapper/LanguageNormalizer.js';

describe('LanguageNormalizer#normalize', () => {
  test('Passes a standard language code through', () => {
    expect(new LanguageNormalizer().normalize('de')).toEqual({ raw: 'de', bcp47: 'de' });
  });

  test.each([
    ['x-jat', 'ja-Latn'],
    ['es-CA', 'ca'],
    ['es-PV', 'eu'],
    ['bd', 'bn'],
    ['my', 'ms'],
    ['bur', 'my'],
    ['al', 'sq'],
    ['tl', 'fil'],
    ['zh-nan', 'zh-Hant-TW'],
    ['x-unk', 'und'],
  ])('Translates the AniDB-specific code %s to %s', (raw, bcp47) => {
    expect(new LanguageNormalizer().normalize(raw)).toEqual({ raw, bcp47 });
  });

  test('Leaves codes that are unknown or unverified without a BCP 47 tag', () => {
    const normalizer = new LanguageNormalizer();

    expect(normalizer.normalize('bs')).toEqual({ raw: 'bs', bcp47: null });
    expect(normalizer.normalize('xx-YY')).toEqual({ raw: 'xx-YY', bcp47: null });
    expect(normalizer.normalize('')).toEqual({ raw: '', bcp47: null });
  });

  test('Does not resolve object prototype keys as language codes', () => {
    expect(new LanguageNormalizer().normalize('constructor')).toEqual({ raw: 'constructor', bcp47: null });
  });

  test('Only maps to canonical BCP 47 tags', () => {
    for (const bcp47 of LanguageNormalizer['ANIDB_TO_BCP47'].values()) {
      expect(Intl.getCanonicalLocales(bcp47)[0]).toBe(bcp47);
    }
  });
});
