import { ZodError } from 'zod';
import { AnimeMapper } from '#src/plugins/official/media/library/external_metadata/AniDb/parsing/mapper/AnimeMapper.js';
import { AnimeParser } from '#src/plugins/official/media/library/external_metadata/AniDb/parsing/AnimeParser.js';
import { LanguageNormalizer } from '#src/plugins/official/media/library/external_metadata/AniDb/parsing/mapper/LanguageNormalizer.js';
import { AnimeValidator } from '#src/plugins/official/media/library/external_metadata/AniDb/parsing/validator/AnimeValidator.js';
import { AniDbXmlReader } from '#src/plugins/official/media/library/external_metadata/AniDb/xml/AniDbXmlReader.js';
import { COMPLETE_ANIME_XML, MINIMAL_ANIME_XML } from './AnimeXmlFixtures.js';

function createParser(): AnimeParser {
  return new AnimeParser(new AniDbXmlReader(), new AnimeMapper(new LanguageNormalizer()), new AnimeValidator());
}

describe('AnimeParser#parse', () => {
  test('Parses an anime with only known keys and values without issues', () => {
    const result = createParser().parse(COMPLETE_ANIME_XML);

    expect(result.parserVersion).toBe(AnimeParser.PARSER_VERSION);
    expect(result.anime.id).toBe(1);
    expect(result.issues).toEqual([]);
  });

  test('Reports unknown values found in the parsed anime', () => {
    const result = createParser().parse(COMPLETE_ANIME_XML.replace('<type>TV Series</type>', '<type>Unknown Anime Type</type>'));

    expect(result.issues).toEqual([{ kind: 'unknown-value', path: 'type', value: 'Unknown Anime Type' }]);
  });

  test('Reports an unknown element and parses the anime as if it was not there', () => {
    const parser = createParser();

    const result = parser.parse(COMPLETE_ANIME_XML.replace('<type>', '<broadcaster>NHK</broadcaster><type>'));

    expect(result.issues).toEqual([{ kind: 'unknown-key', path: 'anime', value: 'broadcaster' }]);
    expect(result.anime).toEqual(parser.parse(COMPLETE_ANIME_XML).anime);
  });

  test('Reports an unknown attribute on an element that otherwise only holds text', () => {
    const result = createParser().parse(COMPLETE_ANIME_XML.replace('<description>', '<description lang="en">'));

    expect(result.issues).toEqual([{ kind: 'unknown-key', path: 'anime.description', value: '@_lang' }]);
    expect(result.anime.description).toBe('Anime description');
  });

  test('Reports an unknown attribute shared by all episodes only once', () => {
    const result = createParser().parse(COMPLETE_ANIME_XML.replaceAll('<episode id=', '<episode new="1" id='));

    expect(result.issues).toEqual([{ kind: 'unknown-key', path: 'anime.episodes.episode[]', value: '@_new' }]);
  });

  test('Reports an unknown attribute on an element that occurs only once', () => {
    const result = createParser().parse(MINIMAL_ANIME_XML.replace('<tag id=', '<tag new="1" id='));

    expect(result.issues).toEqual([{ kind: 'unknown-key', path: 'anime.tags.tag[]', value: '@_new' }]);
    expect(result.anime.tags).toHaveLength(1);
  });

  test('Reports an unknown attribute nested inside an element that occurs only once', () => {
    const result = createParser().parse(MINIMAL_ANIME_XML.replace('<externalentity>', '<externalentity new="1">'));

    expect(result.issues).toEqual([{ kind: 'unknown-key', path: 'anime.resources.resource[].externalentity[]', value: '@_new' }]);
    expect(result.anime.resources.external).toEqual([{ kind: { id: 1, name: 'AnimeNewsNetwork' }, identifiers: ['14'] }]);
  });

  test('Reports an unknown attribute on a url resource and keeps its urls', () => {
    const result = createParser().parse(COMPLETE_ANIME_XML.replace('<resource type="4">', '<resource type="4" new="1">'));

    expect(result.issues).toEqual([{ kind: 'unknown-key', path: 'anime.resources.resource[]', value: '@_new' }]);
    expect(result.anime.resources.external[1]).toEqual({
      kind: { id: 4, name: 'Official Website' },
      urls: ['https://example.com/one', 'https://example.com/two'],
    });
  });

  test('Reports an unknown element next to a url', () => {
    const result = createParser().parse(COMPLETE_ANIME_XML.replace('<url>https://example.com/one</url>', '<url>https://example.com/one</url><new>1</new>'));

    expect(result.issues).toEqual([{ kind: 'unknown-key', path: 'anime.resources.resource[].externalentity[]', value: 'new' }]);
    expect(result.anime.resources.external[1]).toMatchObject({ urls: ['https://example.com/one', 'https://example.com/two'] });
  });

  test('Throws for a resource that mixes urls and identifiers instead of dropping one of them', () => {
    const animeXml = COMPLETE_ANIME_XML.replace(
      '<externalentity><url>https://example.com/two</url></externalentity>',
      '<externalentity><identifier>333</identifier></externalentity>',
    );

    expect(() => createParser().parse(animeXml)).toThrow('A resource cannot mix identifiers and urls');
  });

  test('Throws for an external entity with both identifiers and a url', () => {
    const animeXml = COMPLETE_ANIME_XML.replace(
      '<externalentity><url>https://example.com/two</url></externalentity>',
      '<externalentity><identifier>333</identifier><url>https://example.com/two</url></externalentity>',
    );

    expect(() => createParser().parse(animeXml)).toThrow('An external entity has to have either identifiers or a url');
  });

  test('Throws when anything besides unknown keys is wrong', () => {
    const animeXml = COMPLETE_ANIME_XML
      .replace('<type>', '<broadcaster>NHK</broadcaster><type>')
      .replace('<episodecount>2</episodecount>', '<episodecount>two</episodecount>');

    expect(() => createParser().parse(animeXml)).toThrow(ZodError);
  });
});
