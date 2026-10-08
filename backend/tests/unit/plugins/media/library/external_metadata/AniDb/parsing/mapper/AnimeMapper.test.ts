import type { AniDbAnime } from '../../../../../../../../../src/plugins/official/media/library/external_metadata/AniDb/parsing/Anime.js';
import { AnimeMapper } from '../../../../../../../../../src/plugins/official/media/library/external_metadata/AniDb/parsing/mapper/AnimeMapper.js';
import { NORMALIZING_ANIME_XML_SCHEMA } from '../../../../../../../../../src/plugins/official/media/library/external_metadata/AniDb/parsing/AnimeSchemas.js';
import { LanguageNormalizer } from '../../../../../../../../../src/plugins/official/media/library/external_metadata/AniDb/parsing/mapper/LanguageNormalizer.js';
import { AniDbXmlReader } from '../../../../../../../../../src/plugins/official/media/library/external_metadata/AniDb/xml/AniDbXmlReader.js';
import { COMPLETE_ANIME_XML, MINIMAL_ANIME_XML } from '../AnimeXmlFixtures.js';

function mapXml(animeXml: string): AniDbAnime {
  const normalizedXml = NORMALIZING_ANIME_XML_SCHEMA.parse(new AniDbXmlReader().read(animeXml));
  return new AnimeMapper(new LanguageNormalizer()).map(normalizedXml);
}

describe('AnimeMapper#map', () => {
  test('Maps every field of a complete anime', () => {
    expect(mapXml(COMPLETE_ANIME_XML)).toEqual({
      id: 1,
      restricted: false,
      type: 'TV Series',
      startDate: { year: 2023, month: 10, day: 22 },
      endDate: { year: 2024, month: 3, day: null },
      url: 'https://example.com/',
      pictureFileName: '294282.jpg',
      description: 'Anime description',
      episodeCount: 2,
      titles: [
        { type: 'main', lang: { raw: 'x-jat', bcp47: 'ja-Latn' }, title: 'Kusuriya no Hitorigoto' },
        { type: 'official', lang: { raw: 'en', bcp47: 'en' }, title: 'The Apothecary Diaries' },
        { type: 'synonym', lang: { raw: 'es-CA', bcp47: 'ca' }, title: 'Catalan Title' },
      ],
      relatedAnime: [{ relationType: 'Sequel', id: 2, title: 'Sequel Title' }],
      similarAnime: [{ id: 3, title: 'Similar Title', votes: { total: 35, approval: 33 } }],
      recommendations: {
        total: 9,
        items: [{ type: 'Must See', userId: 42, text: 'Great show' }],
      },
      creators: [{ type: 'Direction', id: 4, name: 'Some Director' }],
      ratings: {
        permanent: { count: 2323, score: 9.39 },
        temporary: { count: 2354, score: 8.58 },
        review: { count: 2, score: 7.41 },
      },
      resources: {
        external: [
          { kind: { id: 2, name: 'MyAnimeList' }, identifiers: ['111', '222'] },
          { kind: { id: 4, name: 'Official Website' }, urls: ['https://example.com/one', 'https://example.com/two'] },
        ],
      },
      characters: [{
        relationType: 'main character in',
        id: 8,
        updatedAt: { year: 2024, month: 3, day: 25 },
        name: 'Maomao',
        gender: 'female',
        description: 'Character description',
        pictureFileName: '295636.jpg',
        rating: { votes: 326, score: 8.68 },
        characterType: { kind: { id: 1, name: 'character' }, label: 'Character' },
        seiyuu: [{ id: 9, name: 'Yuuki Aoi', pictureFileName: '11249.jpeg' }],
      }],
      episodes: [
        {
          id: 10,
          updatedAt: { year: 2023, month: 10, day: 25 },
          episodeNumber: { kind: { id: 1, name: 'regular' }, label: '1' },
          playLengthMinutes: 25,
          airdate: { year: 2023, month: 10, day: 22 },
          recap: false,
          rating: { votes: 21, score: 8.67 },
          titles: [
            { lang: { raw: 'en', bcp47: 'en' }, title: 'Maomao' },
            { lang: { raw: 'x-jat', bcp47: 'ja-Latn' }, title: 'Maomao' },
          ],
          summary: 'Episode summary',
          resources: { external: [{ kind: { id: 28, name: 'Crunchyroll' }, identifiers: ['GMKUXQ2VM'] }] },
        },
        {
          id: 11,
          updatedAt: { year: 2024, month: 1, day: 1 },
          episodeNumber: { kind: { id: 2, name: 'special' }, label: 'S1' },
          playLengthMinutes: 5,
          airdate: null,
          recap: true,
          rating: null,
          titles: [{ lang: { raw: 'en', bcp47: 'en' }, title: 'Special' }],
          summary: null,
          resources: { external: [] },
        },
      ],
      tags: [
        {
          id: 5,
          parentId: 6,
          weight: 300,
          infobox: true,
          localSpoiler: false,
          globalSpoiler: false,
          verified: true,
          updatedAt: { year: 2020, month: 10, day: 4 },
          name: 'some tag',
          description: 'Tag description',
          pictureFileName: '123.jpg',
          resources: { external: [] },
        },
        {
          id: 7,
          parentId: null,
          weight: 0,
          infobox: false,
          localSpoiler: true,
          globalSpoiler: false,
          verified: false,
          updatedAt: null,
          name: 'other tag',
          description: null,
          pictureFileName: null,
          resources: { external: [{ kind: { id: 44, name: 'TMDB' }, identifiers: ['tv', '999'] }] },
        },
      ],
    } satisfies AniDbAnime);
  });

  test('Uses null and empty lists for everything a sparse anime leaves out', () => {
    expect(mapXml(MINIMAL_ANIME_XML)).toEqual({
      id: 12,
      restricted: true,
      type: 'TV Series',
      startDate: null,
      endDate: null,
      url: null,
      pictureFileName: null,
      description: null,
      episodeCount: 0,
      titles: [{ type: 'main', lang: { raw: 'x-jat', bcp47: 'ja-Latn' }, title: 'Minimal' }],
      relatedAnime: [],
      similarAnime: [],
      recommendations: { total: 0, items: [] },
      creators: [],
      ratings: null,
      resources: { external: [{ kind: { id: 1, name: 'AnimeNewsNetwork' }, identifiers: ['14'] }] },
      characters: [],
      episodes: [],
      tags: [{
        id: 13,
        parentId: null,
        weight: 0,
        infobox: false,
        localSpoiler: false,
        globalSpoiler: false,
        verified: false,
        updatedAt: null,
        name: 'only tag',
        description: null,
        pictureFileName: null,
        resources: { external: [] },
      }],
    } satisfies AniDbAnime);
  });

  test('Uses null and empty lists for missing details of ratings and characters', () => {
    const anime = mapXml(MINIMAL_ANIME_XML.replace('</anime>', `
      <ratings><permanent count="1">5.00</permanent></ratings>
      <characters>
        <character id="20" type="appears in" update="2024-01-01">
          <name>Without Seiyuu</name>
          <gender>unknown</gender>
          <charactertype id="1">Character</charactertype>
        </character>
        <character id="21" type="appears in" update="2024-01-01">
          <name>With Seiyuu</name>
          <gender>unknown</gender>
          <charactertype id="1">Character</charactertype>
          <seiyuu id="22">Seiyuu Without Picture</seiyuu>
        </character>
      </characters>
    </anime>`));

    expect(anime.ratings).toEqual({ permanent: { count: 1, score: 5 }, temporary: null, review: null });
    expect(anime.characters[0]).toMatchObject({ description: null, pictureFileName: null, rating: null, seiyuu: [] });
    expect(anime.characters[1].seiyuu).toEqual([{ id: 22, name: 'Seiyuu Without Picture', pictureFileName: null }]);
  });

  test('Uses empty lists for an anime without tags and resources', () => {
    const anime = mapXml(MINIMAL_ANIME_XML
      .replace(/<tags>[\s\S]*<\/tags>/, '')
      .replace(/<resources>[\s\S]*<\/resources>/, ''));

    expect(anime.tags).toEqual([]);
    expect(anime.resources).toEqual({ external: [] });
  });

  test('Normalizes line breaks in free text', () => {
    const anime = mapXml(COMPLETE_ANIME_XML
      .replace('Anime description', 'first&#13;\nsecond')
      .replace('Character description', 'first&#13;\nsecond')
      .replace('Episode summary', 'first&#13;\nsecond')
      .replace('Tag description', 'first&#13;\nsecond')
      .replace('Great show', 'first&#13;\nsecond'));

    expect(anime.description).toBe('first\nsecond');
    expect(anime.characters[0].description).toBe('first\nsecond');
    expect(anime.episodes[0].summary).toBe('first\nsecond');
    expect(anime.tags[0].description).toBe('first\nsecond');
    expect(anime.recommendations.items[0].text).toBe('first\nsecond');
  });

  test('Keeps values it does not know instead of dropping them', () => {
    const anime = mapXml(COMPLETE_ANIME_XML
      .replace('<type>TV Series</type>', '<type>Unknown Anime Type</type>')
      .replace('<epno type="1">', '<epno type="99">')
      .replace('<resource type="2">', '<resource type="9999">')
      .replace('xml:lang="es-CA"', 'xml:lang="bs"'));

    expect(anime.type).toBe('Unknown Anime Type');
    expect(anime.episodes[0].episodeNumber.kind).toEqual({ id: 99, name: null });
    expect(anime.resources.external[0].kind).toEqual({ id: 9999, name: null });
    expect(anime.titles[2].lang).toEqual({ raw: 'bs', bcp47: null });
  });
});
