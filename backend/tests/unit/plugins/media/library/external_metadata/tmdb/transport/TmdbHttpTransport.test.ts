import { HttpResponse } from '@spraxdev/node-commons/http';
import type { DeepMockProxy } from 'vitest-mock-extended';
import { z, ZodError } from 'zod';
import type AppConfiguration from '#src/config/AppConfiguration.js';
import type SimpleHttpClient from '#src/http/SimpleHttpClient.js';
import { TmdbApiError } from '#src/plugins/official/media/library/external_metadata/tmdb/errors/TmdbApiError.js';
import { TmdbError } from '#src/plugins/official/media/library/external_metadata/tmdb/errors/TmdbError.js';
import { TmdbHttpTransport } from '#src/plugins/official/media/library/external_metadata/tmdb/transport/TmdbHttpTransport.js';
import { createStrictDeepMock } from '#tests/test-helpers.js';

const MOVIE_SCHEMA = z.object({ id: z.number(), title: z.string() });
const NOT_FOUND_BODY = '{"success":false,"status_code":34,"status_message":"The resource you requested could not be found."}';

function createResponse(statusCode: number, body: string): HttpResponse {
  return new HttpResponse(statusCode, new Map([['content-type', 'application/json;charset=utf-8']]), Buffer.from(body));
}

describe(TmdbHttpTransport, () => {
  let httpClient: DeepMockProxy<SimpleHttpClient>;
  let subject: TmdbHttpTransport;

  beforeEach(() => {
    httpClient = createStrictDeepMock<SimpleHttpClient>();
    httpClient.get.mockResolvedValue(createResponse(200, '{"id":550,"title":"Fight Club"}'));

    subject = createTransport('eyJhbGciOiJIUzI1NiJ9.test-token');
  });

  function createTransport(apiReadAccessToken: string): TmdbHttpTransport {
    const appConfig = createStrictDeepMock<AppConfiguration>({
      config: { media: { externalProviders: { theMovieDb: { apiReadAccessToken } } } },
    });
    return new TmdbHttpTransport(httpClient, appConfig);
  }

  test('Requests JSON from the v3 API with the configured access token', async () => {
    await subject.fetchJson('/movie/550', MOVIE_SCHEMA, { append_to_response: 'images,translations' });

    expect(httpClient.get).toHaveBeenCalledExactlyOnceWith('https://api.themoviedb.org/3/movie/550', {
      headers: { 'Authorization': 'Bearer eyJhbGciOiJIUzI1NiJ9.test-token', 'Accept': 'application/json' },
      query: { append_to_response: 'images,translations' },
    });
  });

  test.for(['', '   '])('Refuses to contact TMDB while the access token is %j', async (apiReadAccessToken) => {
    const unconfiguredSubject = createTransport(apiReadAccessToken);

    await expect(unconfiguredSubject.fetchJson('/movie/550', MOVIE_SCHEMA)).rejects.toThrow(new TmdbError('The API read access token is not configured'));

    expect(httpClient.get).not.toHaveBeenCalled();
  });

  test('Returns the body as parsed by the schema', async () => {
    await expect(subject.fetchJson('/movie/550', MOVIE_SCHEMA)).resolves.toEqual({ id: 550, title: 'Fight Club' });
  });

  test('Turns empty strings into null before validating the body', async () => {
    httpClient.get.mockResolvedValue(createResponse(200, '{"id":550,"title":"Fight Club","tagline":"","origin_country":["US",""]}'));
    const schema = MOVIE_SCHEMA.extend({ tagline: z.string().nullable(), origin_country: z.array(z.string().nullable()) });

    await expect(subject.fetchJson('/movie/550', schema)).resolves.toEqual({ id: 550, title: 'Fight Club', tagline: null, origin_country: ['US', null] });
  });

  test('Returns null when TMDB does not know the resource', async () => {
    httpClient.get.mockResolvedValue(createResponse(404, NOT_FOUND_BODY));

    await expect(subject.fetchJson('/movie/999999999', MOVIE_SCHEMA)).resolves.toBeNull();
  });

  describe('when TMDB responds with an unexpected status', () => {
    test.for([429, 500, 503])('Reports the status %i as transient', async (statusCode) => {
      httpClient.get.mockResolvedValue(createResponse(statusCode, '{"status_code":25,"status_message":"Your request count is over the allowed limit."}'));

      await expect(subject.fetchJson('/movie/550', MOVIE_SCHEMA)).rejects.toMatchObject({ isTransient: true });
    });

    test('Reports an invalid access token as permanent, naming the status and URL', async () => {
      httpClient.get.mockResolvedValue(createResponse(401, '{"status_code":7,"status_message":"Invalid API key: You must be granted a valid key."}'));

      const result = subject.fetchJson('/movie/550', MOVIE_SCHEMA);

      await expect(result).rejects.toThrow(TmdbApiError);
      await expect(result).rejects.toMatchObject({
        isTransient: false,
        message: expect.stringContaining('unexpected status 401 for https://api.themoviedb.org/3/movie/550'),
      });
    });
  });

  describe('when the body does not match the expectations', () => {
    test('Rejects a body that is not JSON', async () => {
      httpClient.get.mockResolvedValue(createResponse(200, '<html>Service Temporarily Unavailable</html>'));

      await expect(subject.fetchJson('/movie/550', MOVIE_SCHEMA)).rejects.toMatchObject({
        name: 'TmdbApiError',
        isTransient: false,
        cause: expect.any(SyntaxError),
      });
    });

    test('Rejects a body that does not match the schema', async () => {
      httpClient.get.mockResolvedValue(createResponse(200, '{"id":550,"title":null}'));

      await expect(subject.fetchJson('/movie/550', MOVIE_SCHEMA)).rejects.toMatchObject({
        name: 'TmdbApiError',
        isTransient: false,
        cause: expect.any(ZodError),
      });
    });
  });

  describe('when it comes to keys the schema does not declare', () => {
    let consoleWarn: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    test('Warns about them, naming each key', async () => {
      httpClient.get.mockResolvedValue(createResponse(200, '{"id":550,"title":"Fight Club","softcore":false,"genres":[{"id":18,"name":"Drama"}]}'));

      await subject.fetchJson('/movie/550', MOVIE_SCHEMA);

      expect(consoleWarn).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('2 keys the schema does not know yet: softcore, genres'));
    });

    test('Does not warn when the schema declares every key', async () => {
      await subject.fetchJson('/movie/550', MOVIE_SCHEMA);

      expect(consoleWarn).not.toHaveBeenCalled();
    });
  });
});
