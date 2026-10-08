import { IssueCollector } from '#src/plugins/official/media/library/external_metadata/AniDb/parsing/validator/IssueCollector.js';

describe(IssueCollector, () => {
  test('Starts without issues', () => {
    expect(new IssueCollector().toArray()).toEqual([]);
  });

  test('Reports a value missing from the known values', () => {
    const collector = new IssueCollector();

    collector.checkValue('type', ['TV Series'], 'TV Series');
    collector.checkValue('type', ['TV Series'], 'Movie');

    expect(collector.toArray()).toEqual([{ kind: 'unknown-value', path: 'type', value: 'Movie' }]);
  });

  test('Reports an unclassified id by its id', () => {
    const collector = new IssueCollector();

    collector.checkClassified('episodes[].episodeNumber.kind', { id: 1, name: 'regular' });
    collector.checkClassified('episodes[].episodeNumber.kind', { id: 7, name: null });

    expect(collector.toArray()).toEqual([{ kind: 'unknown-value', path: 'episodes[].episodeNumber.kind', value: 7 }]);
  });

  test('Reports a language without a BCP 47 tag by its raw code', () => {
    const collector = new IssueCollector();

    collector.checkLanguage('titles[].lang', { raw: 'de', bcp47: 'de' });
    collector.checkLanguage('titles[].lang', { raw: 'bs', bcp47: null });

    expect(collector.toArray()).toEqual([{ kind: 'unknown-value', path: 'titles[].lang', value: 'bs' }]);
  });

  test('Reports an unknown key with its path', () => {
    const collector = new IssueCollector();

    collector.addUnknownKey('anime', 'broadcaster');

    expect(collector.toArray()).toEqual([{ kind: 'unknown-key', path: 'anime', value: 'broadcaster' }]);
  });

  test('Reports the same value on the same path only once', () => {
    const collector = new IssueCollector();

    collector.checkValue('type', [], 'Movie');
    collector.checkValue('type', [], 'Movie');
    collector.addUnknownKey('anime.episodes.episode[]', '@_new');
    collector.addUnknownKey('anime.episodes.episode[]', '@_new');

    expect(collector.toArray()).toEqual([
      { kind: 'unknown-value', path: 'type', value: 'Movie' },
      { kind: 'unknown-key', path: 'anime.episodes.episode[]', value: '@_new' },
    ]);
  });

  test('Keeps the same value on different paths apart', () => {
    const collector = new IssueCollector();

    collector.checkValue('titles[].type', [], 'short');
    collector.checkValue('relatedAnime[].relationType', [], 'short');

    expect(collector.toArray()).toEqual([
      { kind: 'unknown-value', path: 'titles[].type', value: 'short' },
      { kind: 'unknown-value', path: 'relatedAnime[].relationType', value: 'short' },
    ]);
  });
});
