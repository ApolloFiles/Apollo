import { describe, expect, test, vi } from 'vitest';
import type { DeepMockProxy } from 'vitest-mock-extended';
import { ZodError } from 'zod';
import { AniDbClient } from '../../../../../../../src/plugins/official/media/library/external_metadata/AniDb/AniDbClient.js';
import { AniDbError } from '../../../../../../../src/plugins/official/media/library/external_metadata/AniDb/errors/AniDbError.js';
import { AniDbCdnError } from '../../../../../../../src/plugins/official/media/library/external_metadata/AniDb/errors/AniDbCdnError.js';
import { AniDbParseError } from '../../../../../../../src/plugins/official/media/library/external_metadata/AniDb/errors/AniDbParseError.js';
import type { AnimeXmlFetcher } from '../../../../../../../src/plugins/official/media/library/external_metadata/AniDb/fetching/AnimeXmlFetcher.js';
import type { ImageFetcher } from '../../../../../../../src/plugins/official/media/library/external_metadata/AniDb/fetching/ImageFetcher.js';
import { AnimeMapper } from '../../../../../../../src/plugins/official/media/library/external_metadata/AniDb/parsing/mapper/AnimeMapper.js';
import { AnimeParser } from '../../../../../../../src/plugins/official/media/library/external_metadata/AniDb/parsing/AnimeParser.js';
import { LanguageNormalizer } from '../../../../../../../src/plugins/official/media/library/external_metadata/AniDb/parsing/mapper/LanguageNormalizer.js';
import { AnimeValidator } from '../../../../../../../src/plugins/official/media/library/external_metadata/AniDb/parsing/validator/AnimeValidator.js';
import { AniDbXmlReader } from '../../../../../../../src/plugins/official/media/library/external_metadata/AniDb/xml/AniDbXmlReader.js';
import { createStrictDeepMock } from '../../../../../../test-helpers.js';
import { COMPLETE_ANIME_XML } from './parsing/AnimeXmlFixtures.js';

const IMAGE_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);

function createClient(animeXml: string | null = COMPLETE_ANIME_XML): {
  subject: AniDbClient,
  mocks: { animeXmlFetcher: DeepMockProxy<AnimeXmlFetcher>, imageFetcher: DeepMockProxy<ImageFetcher> },
} {
  const animeXmlFetcher = createStrictDeepMock<AnimeXmlFetcher>();
  animeXmlFetcher.fetchXml.mockResolvedValue(animeXml);

  const imageFetcher = createStrictDeepMock<ImageFetcher>();
  imageFetcher.fetchImage.mockResolvedValue(IMAGE_BYTES);

  const animeParser = new AnimeParser(new AniDbXmlReader(), new AnimeMapper(new LanguageNormalizer()), new AnimeValidator());
  return {
    subject: new AniDbClient(animeXmlFetcher, animeParser, imageFetcher),
    mocks: { animeXmlFetcher, imageFetcher },
  };
}

describe('AniDbClient#fetchAnime', () => {
  test('Fetches and parses the anime with the given id', async () => {
    const { subject, mocks } = createClient();

    const anime = await subject.fetchAnime(1);

    expect(mocks.animeXmlFetcher.fetchXml).toHaveBeenCalledExactlyOnceWith(1);
    expect(anime?.id).toBe(1);
    expect(anime?.titles[0].title).toBe('Kusuriya no Hitorigoto');
  });

  test.each([0, -1, 1.5, NaN, Infinity])('Rejects the anime id %s without fetching anything', async (animeId) => {
    const { subject, mocks } = createClient();

    await expect(subject.fetchAnime(animeId)).rejects.toThrow(AniDbError);
    expect(mocks.animeXmlFetcher.fetchXml).not.toHaveBeenCalled();
  });

  test('Returns null when the anime does not exist', async () => {
    const { subject } = createClient(null);

    await expect(subject.fetchAnime(1)).resolves.toBeNull();
  });

  test('Shares one fetch between concurrent calls for the same anime', async () => {
    const { subject, mocks } = createClient();

    const [first, second] = await Promise.all([subject.fetchAnime(1), subject.fetchAnime(1)]);

    expect(mocks.animeXmlFetcher.fetchXml).toHaveBeenCalledOnce();
    expect(second).toBe(first);
  });

  test('Fetches again once the previous call has finished', async () => {
    const { subject, mocks } = createClient();

    await subject.fetchAnime(1);
    await subject.fetchAnime(1);

    expect(mocks.animeXmlFetcher.fetchXml).toHaveBeenCalledTimes(2);
  });

  test('Fetches different anime separately', async () => {
    const { subject, mocks } = createClient();

    await Promise.all([subject.fetchAnime(1), subject.fetchAnime(2)]);

    expect(mocks.animeXmlFetcher.fetchXml).toHaveBeenCalledTimes(2);
    expect(mocks.animeXmlFetcher.fetchXml).toHaveBeenCalledWith(1);
    expect(mocks.animeXmlFetcher.fetchXml).toHaveBeenCalledWith(2);
  });

  test('Does not warn about an anime with only known keys and values', async () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { subject } = createClient();

    await subject.fetchAnime(1);

    expect(consoleWarn).not.toHaveBeenCalled();
  });

  test('Warns once about all unknown keys and values of an anime', async () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { subject } = createClient(COMPLETE_ANIME_XML
      .replace('<type>TV Series</type>', '<type>Unknown Anime Type</type>')
      .replace('<type>', '<broadcaster>NHK</broadcaster><type>'));

    const anime = await subject.fetchAnime(1);

    expect(anime?.type).toBe('Unknown Anime Type');
    expect(consoleWarn).toHaveBeenCalledOnce();
    expect(consoleWarn.mock.calls[0][0]).toContain('Anime 1');
    expect(consoleWarn.mock.calls[0][0]).toContain('unknown-key anime="broadcaster"');
    expect(consoleWarn.mock.calls[0][0]).toContain('unknown-value type="Unknown Anime Type"');
  });

  test('Wraps a parse failure into an AniDbParseError that keeps the cause', async () => {
    const { subject } = createClient(COMPLETE_ANIME_XML.replace('<episodecount>2</episodecount>', '<episodecount>two</episodecount>'));

    const error = await subject.fetchAnime(1).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(AniDbParseError);
    expect((error as AniDbParseError).message).toBe('Unable to parse the AniDB XML of anime 1');
    expect((error as AniDbParseError).cause).toBeInstanceOf(ZodError);
  });

  test('Passes errors of the fetcher through unchanged', async () => {
    const { subject, mocks } = createClient();
    const fetchError = new Error('Banned');
    mocks.animeXmlFetcher.fetchXml.mockRejectedValue(fetchError);

    await expect(subject.fetchAnime(1)).rejects.toBe(fetchError);
  });
});

describe('AniDbClient#fetchImage', () => {
  test('Fetches the image with the given file name', async () => {
    const { subject, mocks } = createClient();

    await expect(subject.fetchImage('294282.jpg')).resolves.toEqual(IMAGE_BYTES);

    expect(mocks.imageFetcher.fetchImage).toHaveBeenCalledExactlyOnceWith('294282.jpg');
  });

  test.each(['294282.jpg', '11249.jpeg', '67867.png', '1.GIF'])('Accepts the file name %s', async (fileName) => {
    const { subject } = createClient();

    await expect(subject.fetchImage(fileName)).resolves.toEqual(IMAGE_BYTES);
  });

  test.each([
    '',
    '294282',
    '.jpg',
    'abc.jpg',
    '294282.',
    '294282.jpg.exe',
    '294282xjpg',
    '../294282.jpg',
    '294282.jpg?size=1',
    '294282/jpg',
    ' 294282.jpg',
  ])('Rejects the file name %j without fetching anything', async (fileName) => {
    const { subject, mocks } = createClient();

    await expect(subject.fetchImage(fileName)).rejects.toThrow(AniDbError);
    expect(mocks.imageFetcher.fetchImage).not.toHaveBeenCalled();
  });

  test('Shares one fetch between concurrent calls for the same image', async () => {
    const { subject, mocks } = createClient();

    const [first, second] = await Promise.all([subject.fetchImage('294282.jpg'), subject.fetchImage('294282.jpg')]);

    expect(mocks.imageFetcher.fetchImage).toHaveBeenCalledOnce();
    expect(second).toBe(first);
  });

  test('Fetches different images separately', async () => {
    const { subject, mocks } = createClient();

    await Promise.all([subject.fetchImage('294282.jpg'), subject.fetchImage('67867.png')]);

    expect(mocks.imageFetcher.fetchImage).toHaveBeenCalledTimes(2);
  });

  test('Does not share an in-flight image fetch with an anime fetch', async () => {
    const { subject, mocks } = createClient();

    await Promise.all([subject.fetchAnime(1), subject.fetchImage('1.jpg')]);

    expect(mocks.animeXmlFetcher.fetchXml).toHaveBeenCalledOnce();
    expect(mocks.imageFetcher.fetchImage).toHaveBeenCalledOnce();
  });

  test('Passes errors of the image fetcher through unchanged', async () => {
    const { subject, mocks } = createClient();
    const cdnError = AniDbCdnError.createForNotFoundResponse('294282.jpg');
    mocks.imageFetcher.fetchImage.mockRejectedValue(cdnError);

    await expect(subject.fetchImage('294282.jpg')).rejects.toBe(cdnError);
  });
});
