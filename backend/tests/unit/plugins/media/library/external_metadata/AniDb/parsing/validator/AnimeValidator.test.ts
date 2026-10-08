import type { AniDbAnime } from '#src/plugins/official/media/library/external_metadata/AniDb/parsing/Anime.js';
import { AnimeValidator } from '#src/plugins/official/media/library/external_metadata/AniDb/parsing/validator/AnimeValidator.js';
import { IssueCollector, type ParseIssue } from '#src/plugins/official/media/library/external_metadata/AniDb/parsing/validator/IssueCollector.js';
import { createCompleteAnime } from '#tests/unit/plugins/media/library/external_metadata/AniDb/parsing/AnimeXmlFixtures.js';

function validate(anime: AniDbAnime): ParseIssue[] {
  const issueCollector = new IssueCollector();
  new AnimeValidator().validate(anime, issueCollector);
  return issueCollector.toArray();
}

describe(AnimeValidator, () => {
  test('Reports nothing for an anime with only known values', () => {
    expect(validate(createCompleteAnime())).toEqual([]);
  });

  test('Reports unknown literal values with their path', () => {
    const anime = createCompleteAnime();
    anime.type = 'Unknown Anime Type';
    anime.titles[0].type = 'unknown title type';
    anime.relatedAnime[0].relationType = 'Unknown Relation';
    anime.recommendations.items[0].type = 'Unknown Recommendation';
    anime.creators[0].type = 'Unknown Creator Role';
    anime.characters[0].relationType = 'unknown relation in';
    anime.characters[0].gender = 'unknown gender';

    expect(validate(anime)).toEqual([
      { kind: 'unknown-value', path: 'type', value: 'Unknown Anime Type' },
      { kind: 'unknown-value', path: 'titles[].type', value: 'unknown title type' },
      { kind: 'unknown-value', path: 'relatedAnime[].relationType', value: 'Unknown Relation' },
      { kind: 'unknown-value', path: 'recommendations.items[].type', value: 'Unknown Recommendation' },
      { kind: 'unknown-value', path: 'creators[].type', value: 'Unknown Creator Role' },
      { kind: 'unknown-value', path: 'characters[].relationType', value: 'unknown relation in' },
      { kind: 'unknown-value', path: 'characters[].gender', value: 'unknown gender' },
    ]);
  });

  test('Reports unclassified ids by their id', () => {
    const anime = createCompleteAnime();
    anime.characters[0].characterType.kind = { id: 5, name: null };
    anime.episodes[0].episodeNumber.kind = { id: 7, name: null };

    expect(validate(anime)).toEqual([
      { kind: 'unknown-value', path: 'characters[].characterType.kind', value: 5 },
      { kind: 'unknown-value', path: 'episodes[].episodeNumber.kind', value: 7 },
    ]);
  });

  test('Reports unknown resource types of the anime, its episodes and its tags', () => {
    const anime = createCompleteAnime();
    anime.resources.external[0].kind = { id: 9001, name: null };
    anime.episodes[0].resources.external[0].kind = { id: 9002, name: null };
    anime.tags[1].resources.external[0].kind = { id: 9003, name: null };

    expect(validate(anime)).toEqual([
      { kind: 'unknown-value', path: 'resources.external[].kind', value: 9001 },
      { kind: 'unknown-value', path: 'episodes[].resources.external[].kind', value: 9002 },
      { kind: 'unknown-value', path: 'tags[].resources.external[].kind', value: 9003 },
    ]);
  });

  test('Reports languages without a BCP 47 tag by their raw code', () => {
    const anime = createCompleteAnime();
    anime.titles[2].lang = { raw: 'bs', bcp47: null };
    anime.episodes[1].titles[0].lang = { raw: 'xx', bcp47: null };

    expect(validate(anime)).toEqual([
      { kind: 'unknown-value', path: 'titles[].lang', value: 'bs' },
      { kind: 'unknown-value', path: 'episodes[].titles[].lang', value: 'xx' },
    ]);
  });

  test('Reports an unknown value shared by several episodes only once', () => {
    const anime = createCompleteAnime();
    anime.episodes[0].episodeNumber.kind = { id: 7, name: null };
    anime.episodes[1].episodeNumber.kind = { id: 7, name: null };

    expect(validate(anime)).toEqual([
      { kind: 'unknown-value', path: 'episodes[].episodeNumber.kind', value: 7 },
    ]);
  });
});
