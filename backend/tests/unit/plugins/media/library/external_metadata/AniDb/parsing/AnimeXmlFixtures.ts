import type { AniDbAnime } from '#src/plugins/official/media/library/external_metadata/AniDb/parsing/Anime.js';

export const COMPLETE_ANIME_XML = `<?xml version="1.0" encoding="UTF-8"?><anime id="1" restricted="false">
  <type>TV Series</type>
  <episodecount>2</episodecount>
  <startdate>2023-10-22</startdate>
  <enddate>2024-03</enddate>
  <titles>
    <title xml:lang="x-jat" type="main">Kusuriya no Hitorigoto</title>
    <title xml:lang="en" type="official">The Apothecary Diaries</title>
    <title xml:lang="es-CA" type="synonym">Catalan Title</title>
  </titles>
  <relatedanime>
    <anime id="2" type="Sequel">Sequel Title</anime>
  </relatedanime>
  <similaranime>
    <anime id="3" approval="33" total="35">Similar Title</anime>
  </similaranime>
  <recommendations total="9">
    <recommendation type="Must See" uid="42">Great show</recommendation>
  </recommendations>
  <url>https://example.com/</url>
  <creators>
    <name id="4" type="Direction">Some Director</name>
  </creators>
  <description>Anime description</description>
  <ratings>
    <permanent count="2323">9.39</permanent>
    <temporary count="2354">8.58</temporary>
    <review count="2">7.41</review>
  </ratings>
  <picture>294282.jpg</picture>
  <resources>
    <resource type="2">
      <externalentity><identifier>111</identifier></externalentity>
      <externalentity><identifier>222</identifier></externalentity>
    </resource>
    <resource type="4">
      <externalentity><url>https://example.com/one</url></externalentity>
      <externalentity><url>https://example.com/two</url></externalentity>
    </resource>
  </resources>
  <tags>
    <tag id="5" parentid="6" infobox="true" weight="300" localspoiler="false" globalspoiler="false" verified="true" update="2020-10-04">
      <name>some tag</name>
      <description>Tag description</description>
      <picurl>123.jpg</picurl>
    </tag>
    <tag id="7" weight="0" localspoiler="true" globalspoiler="false" verified="false">
      <name>other tag</name>
      <resources>
        <resource type="44">
          <externalentity><identifier>tv</identifier><identifier>999</identifier></externalentity>
        </resource>
      </resources>
    </tag>
  </tags>
  <characters>
    <character id="8" type="main character in" update="2024-03-25">
      <rating votes="326">8.68</rating>
      <name>Maomao</name>
      <gender>female</gender>
      <charactertype id="1">Character</charactertype>
      <description>Character description</description>
      <picture>295636.jpg</picture>
      <seiyuu id="9" picture="11249.jpeg">Yuuki Aoi</seiyuu>
    </character>
  </characters>
  <episodes>
    <episode id="10" update="2023-10-25">
      <epno type="1">1</epno>
      <length>25</length>
      <airdate>2023-10-22</airdate>
      <rating votes="21">8.67</rating>
      <title xml:lang="en">Maomao</title>
      <title xml:lang="x-jat">Maomao</title>
      <summary>Episode summary</summary>
      <resources>
        <resource type="28"><externalentity><identifier>GMKUXQ2VM</identifier></externalentity></resource>
      </resources>
    </episode>
    <episode id="11" update="2024-01-01" recap="true">
      <epno type="2">S1</epno>
      <length>5</length>
      <title xml:lang="en">Special</title>
    </episode>
  </episodes>
</anime>`;

export const MINIMAL_ANIME_XML = `<?xml version="1.0" encoding="UTF-8"?><anime id="12" restricted="true">
  <type>TV Series</type>
  <episodecount>0</episodecount>
  <titles>
    <title xml:lang="x-jat" type="main">Minimal</title>
  </titles>
  <tags>
    <tag id="13" weight="0" localspoiler="false" globalspoiler="false" verified="false"><name>only tag</name></tag>
  </tags>
  <resources>
    <resource type="1"><externalentity><identifier>14</identifier></externalentity></resource>
  </resources>
</anime>`;

export function createCompleteAnime(): AniDbAnime {
  return {
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
  };
}
