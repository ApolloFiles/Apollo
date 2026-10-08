import type { DeepMockProxy } from 'vitest-mock-extended';
import { ZodError } from 'zod';
import { AniDbClient } from '#src/plugins/official/media/library/external_metadata/AniDb/AniDbClient.js';
import { AniDbError } from '#src/plugins/official/media/library/external_metadata/AniDb/errors/AniDbError.js';
import { AniDbCdnError } from '#src/plugins/official/media/library/external_metadata/AniDb/errors/AniDbCdnError.js';
import { AniDbParseError } from '#src/plugins/official/media/library/external_metadata/AniDb/errors/AniDbParseError.js';
import type { AnimeXmlFetcher } from '#src/plugins/official/media/library/external_metadata/AniDb/fetching/AnimeXmlFetcher.js';
import type { ImageFetcher } from '#src/plugins/official/media/library/external_metadata/AniDb/fetching/ImageFetcher.js';
import { AnimeMapper } from '#src/plugins/official/media/library/external_metadata/AniDb/parsing/mapper/AnimeMapper.js';
import { AnimeParser } from '#src/plugins/official/media/library/external_metadata/AniDb/parsing/AnimeParser.js';
import { LanguageNormalizer } from '#src/plugins/official/media/library/external_metadata/AniDb/parsing/mapper/LanguageNormalizer.js';
import { AnimeValidator } from '#src/plugins/official/media/library/external_metadata/AniDb/parsing/validator/AnimeValidator.js';
import { AniDbXmlReader } from '#src/plugins/official/media/library/external_metadata/AniDb/xml/AniDbXmlReader.js';
import { createStrictDeepMock } from '#tests/test-helpers.js';
import { COMPLETE_ANIME_XML } from './parsing/AnimeXmlFixtures.js';

const IMAGE_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);

describe(AniDbClient, () => {
  let animeXmlFetcher: DeepMockProxy<AnimeXmlFetcher>;
  let imageFetcher: DeepMockProxy<ImageFetcher>;
  let subject: AniDbClient;

  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    animeXmlFetcher = createStrictDeepMock<AnimeXmlFetcher>();
    animeXmlFetcher.fetchXml.mockResolvedValue(COMPLETE_ANIME_XML);

    imageFetcher = createStrictDeepMock<ImageFetcher>();
    imageFetcher.fetchImage.mockResolvedValue(IMAGE_BYTES);

    const animeParser = new AnimeParser(new AniDbXmlReader(), new AnimeMapper(new LanguageNormalizer()), new AnimeValidator());
    subject = new AniDbClient(animeXmlFetcher, animeParser, imageFetcher);
  });

  describe('fetchAnime', () => {
    test('Fetches and parses the anime with the given id', async () => {
      const anime = await subject.fetchAnime(1);

      expect(animeXmlFetcher.fetchXml).toHaveBeenCalledExactlyOnceWith(1);
      expect(anime?.id).toBe(1);
      expect(anime?.titles[0].title).toBe('Kusuriya no Hitorigoto');
    });

    test.for([
      { animeId: 0 },
      { animeId: -1 },
      { animeId: 1.5 },
      { animeId: NaN },
      { animeId: Infinity },
    ])('Rejects the anime id $animeId without fetching anything', async ({ animeId }) => {
      await expect(subject.fetchAnime(animeId)).rejects.toThrow(AniDbError);
      await expect(subject.fetchAnime(animeId)).rejects.toThrow('The animeId has to be positive');

      expect(animeXmlFetcher.fetchXml).not.toHaveBeenCalled();
    });

    test('Returns null when the anime does not exist', async () => {
      animeXmlFetcher.fetchXml.mockResolvedValue(null);

      await expect(subject.fetchAnime(1)).resolves.toBeNull();
    });

    test('Shares one fetch between concurrent calls for the same anime', async () => {
      const [first, second] = await Promise.all([subject.fetchAnime(1), subject.fetchAnime(1)]);

      expect(animeXmlFetcher.fetchXml).toHaveBeenCalledOnce();
      expect(second).toBe(first);
    });

    test('Fetches again once the previous call has finished', async () => {
      await subject.fetchAnime(1);
      await subject.fetchAnime(1);

      expect(animeXmlFetcher.fetchXml).toHaveBeenCalledTimes(2);
    });

    test('Fetches different anime separately', async () => {
      await Promise.all([subject.fetchAnime(1), subject.fetchAnime(2)]);

      expect(animeXmlFetcher.fetchXml).toHaveBeenCalledTimes(2);
      expect(animeXmlFetcher.fetchXml).toHaveBeenCalledWith(1);
      expect(animeXmlFetcher.fetchXml).toHaveBeenCalledWith(2);
    });

    test('Does not warn about an anime with only known keys and values', async () => {
      await subject.fetchAnime(1);

      expect(console.warn).not.toHaveBeenCalled();
    });

    test('Warns once about all unknown keys and values of an anime', async () => {
      animeXmlFetcher.fetchXml.mockResolvedValue(COMPLETE_ANIME_XML
        .replace('<type>TV Series</type>', '<type>Unknown Anime Type</type>')
        .replace('<type>', '<broadcaster>NHK</broadcaster><type>'));

      const anime = await subject.fetchAnime(1);

      expect(anime?.type).toBe('Unknown Anime Type');
      expect(console.warn).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('Anime 1'));
      expect(vi.mocked(console.warn).mock.calls[0][0]).toContain('unknown-key anime="broadcaster"');
      expect(vi.mocked(console.warn).mock.calls[0][0]).toContain('unknown-value type="Unknown Anime Type"');
    });

    test('Wraps a parse failure into an AniDbParseError that keeps the cause', async () => {
      animeXmlFetcher.fetchXml.mockResolvedValue(COMPLETE_ANIME_XML.replace('<episodecount>2</episodecount>', '<episodecount>two</episodecount>'));

      await expect(subject.fetchAnime(1)).rejects.toThrow(AniDbParseError);
      await expect(subject.fetchAnime(1)).rejects.toThrow('Unable to parse the AniDB XML of anime 1');
      await expect(subject.fetchAnime(1)).rejects.toMatchObject({ cause: expect.any(ZodError) });
    });

    test('Passes errors of the fetcher through unchanged', async () => {
      const fetchError = new Error('Banned');
      animeXmlFetcher.fetchXml.mockRejectedValue(fetchError);

      await expect(subject.fetchAnime(1)).rejects.toBe(fetchError);
    });
  });

  describe('fetchImage', () => {
    test('Fetches the image with the given file name', async () => {
      await expect(subject.fetchImage('294282.jpg')).resolves.toEqual(IMAGE_BYTES);

      expect(imageFetcher.fetchImage).toHaveBeenCalledExactlyOnceWith('294282.jpg');
    });

    test.for([
      { fileName: '294282.jpg' },
      { fileName: '11249.jpeg' },
      { fileName: '67867.png' },
      { fileName: '1.GIF' },
    ])('Accepts the file name $fileName', async ({ fileName }) => {
      await expect(subject.fetchImage(fileName)).resolves.toEqual(IMAGE_BYTES);
    });

    test.for([
      { fileName: '' },
      { fileName: '294282' },
      { fileName: '.jpg' },
      { fileName: 'abc.jpg' },
      { fileName: '294282.' },
      { fileName: '294282.jpg.exe' },
      { fileName: '294282xjpg' },
      { fileName: '../294282.jpg' },
      { fileName: '294282.jpg?size=1' },
      { fileName: '294282/jpg' },
      { fileName: ' 294282.jpg' },
    ])('Rejects the file name "$fileName" without fetching anything', async ({ fileName }) => {
      await expect(subject.fetchImage(fileName)).rejects.toThrow(AniDbError);
      await expect(subject.fetchImage(fileName)).rejects.toThrow('looks invalid');

      expect(imageFetcher.fetchImage).not.toHaveBeenCalled();
    });

    test('Shares one fetch between concurrent calls for the same image', async () => {
      const [first, second] = await Promise.all([subject.fetchImage('294282.jpg'), subject.fetchImage('294282.jpg')]);

      expect(imageFetcher.fetchImage).toHaveBeenCalledOnce();
      expect(second).toBe(first);
    });

    test('Fetches different images separately', async () => {
      await Promise.all([subject.fetchImage('294282.jpg'), subject.fetchImage('67867.png')]);

      expect(imageFetcher.fetchImage).toHaveBeenCalledTimes(2);
    });

    test('Does not share an in-flight image fetch with an anime fetch', async () => {
      await Promise.all([subject.fetchAnime(1), subject.fetchImage('1.jpg')]);

      expect(animeXmlFetcher.fetchXml).toHaveBeenCalledOnce();
      expect(imageFetcher.fetchImage).toHaveBeenCalledOnce();
    });

    test('Passes errors of the image fetcher through unchanged', async () => {
      const cdnError = AniDbCdnError.createForNotFoundResponse('294282.jpg');
      imageFetcher.fetchImage.mockRejectedValue(cdnError);

      await expect(subject.fetchImage('294282.jpg')).rejects.toBe(cdnError);
    });
  });
});
