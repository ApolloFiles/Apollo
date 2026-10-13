import { CacheCodecs } from '#src/cache/CacheCodec.js';
import type { CacheEntry } from '#src/cache/CacheEntry.js';
import { CacheEntryResponder, type CacheEntryResponseOptions } from '#src/cache/http/CacheEntryResponder.js';
import { FileCacheEntry } from '#src/cache/internal/entry/FileCacheEntry.js';
import { InMemoryCacheEntry } from '#src/cache/internal/entry/InMemoryCacheEntry.js';
import { NullCacheEntry } from '#src/cache/internal/entry/NullCacheEntry.js';
import { createTemporaryTestDirectory } from '#tests/test-helpers.js';
import Fastify, { type FastifyInstance, type InjectOptions } from 'fastify';
import Fs from 'node:fs';
import Path from 'node:path';

const POSTER = Buffer.from('0123456789abcdefghij');
const FILE_ID = 'd052861a-12ea-4df8-aad7-2f53ae4aef70';
const CREATED_AT = new Date('2026-10-01T08:00:00.250Z');

describe(CacheEntryResponder, () => {
  let tmpDir: string;
  let server: FastifyInstance;
  let entry: CacheEntry<unknown>;
  let options: CacheEntryResponseOptions;
  let fileHandle: Fs.promises.FileHandle;

  beforeEach(async () => {
    tmpDir = await createTemporaryTestDirectory();
    await Fs.promises.writeFile(Path.join(tmpDir, FILE_ID), POSTER);
    fileHandle = await Fs.promises.open(Path.join(tmpDir, FILE_ID), 'r');
    entry = new FileCacheEntry(fileHandle, CacheCodecs.bytes(), false, CREATED_AT, FILE_ID, 'image/avif', POSTER.length);
    options = {};

    const responder = new CacheEntryResponder();
    server = Fastify();
    server.get('/poster.avif', (request, reply) => responder.send(request, reply, entry, options));
  });

  afterEach(async () => {
    await server.close();
    await fileHandle.close().catch(() => undefined);
  });

  function request(headers: InjectOptions['headers'] = {}, method: 'GET' | 'HEAD' = 'GET') {
    return server.inject({ method, url: '/poster.avif', headers });
  }

  function isFileHandleClosed(): boolean {
    return fileHandle.fd === -1;
  }

  describe('the whole entry', () => {
    test('Sends the content with its type and length', async () => {
      const response = await request();

      expect(response.statusCode).toBe(200);
      expect(response.rawPayload).toEqual(POSTER);
      expect(response.headers['content-type']).toBe('image/avif');
      expect(response.headers['content-length']).toBe('20');
    });

    test('Sends the file id as ETag and the creation time as Last-Modified', async () => {
      const response = await request();

      expect(response.headers.etag).toBe('"d052861a-12ea-4df8-aad7-2f53ae4aef70"');
      expect(response.headers['last-modified']).toBe('Thu, 01 Oct 2026 08:00:00 GMT');
    });

    test('Announces that it accepts ranges', async () => {
      const response = await request();

      expect(response.headers['accept-ranges']).toBe('bytes');
    });

    test('Sends the given Cache-Control', async () => {
      options = { cacheControl: 'private, max-age=300' };

      const response = await request();

      expect(response.headers['cache-control']).toBe('private, max-age=300');
    });

    test('Sends no Cache-Control unless given one', async () => {
      const response = await request();

      expect(response.headers['cache-control']).toBeUndefined();
    });

    test('Falls back to application/octet-stream for an entry without a content type', async () => {
      entry = new FileCacheEntry(fileHandle, CacheCodecs.bytes(), false, CREATED_AT, FILE_ID, null, POSTER.length);

      const response = await request();

      expect(response.headers['content-type']).toBe('application/octet-stream');
    });

    test('Sends no ETag for an entry that was never stored', async () => {
      entry = new InMemoryCacheEntry(POSTER, CacheCodecs.bytes().decode, false, CREATED_AT, null, 'image/avif');

      const response = await request();

      expect(response.rawPayload).toEqual(POSTER);
      expect(response.headers.etag).toBeUndefined();
    });

    test('Closes the file once it is sent', async () => {
      await request();

      expect(isFileHandleClosed()).toBe(true);
    });
  });

  describe('a cached null', () => {
    beforeEach(() => {
      entry = new NullCacheEntry(false, CREATED_AT);
    });

    test('Answers with 404', async () => {
      const response = await request();

      expect(response.statusCode).toBe(404);
    });
  });

  describe('conditional requests', () => {
    test.for([
      { ifNoneMatch: '"d052861a-12ea-4df8-aad7-2f53ae4aef70"' },
      { ifNoneMatch: 'W/"d052861a-12ea-4df8-aad7-2f53ae4aef70"' },
      { ifNoneMatch: '"7b1f0c2e-6a4d-4e8b-9c3f-1d2e5a8b0c47", "d052861a-12ea-4df8-aad7-2f53ae4aef70"' },
      { ifNoneMatch: '*' },
    ])('Answers with 304 and no body for If-None-Match: $ifNoneMatch', async ({ ifNoneMatch }) => {
      const response = await request({ 'if-none-match': ifNoneMatch });

      expect(response.statusCode).toBe(304);
      expect(response.rawPayload).toHaveLength(0);
    });

    test('Repeats the ETag and Cache-Control in a 304', async () => {
      options = { cacheControl: 'private, max-age=300' };

      const response = await request({ 'if-none-match': '"d052861a-12ea-4df8-aad7-2f53ae4aef70"' });

      expect(response.headers.etag).toBe('"d052861a-12ea-4df8-aad7-2f53ae4aef70"');
      expect(response.headers['cache-control']).toBe('private, max-age=300');
    });

    test('Closes the file when answering with 304', async () => {
      await request({ 'if-none-match': '"d052861a-12ea-4df8-aad7-2f53ae4aef70"' });

      expect(isFileHandleClosed()).toBe(true);
    });

    test('Sends the content when If-None-Match names an older version, ignoring If-Modified-Since', async () => {
      const response = await request({
        'if-none-match': '"7b1f0c2e-6a4d-4e8b-9c3f-1d2e5a8b0c47"',
        'if-modified-since': 'Thu, 01 Oct 2026 09:00:00 GMT',
      });

      expect(response.statusCode).toBe(200);
      expect(response.rawPayload).toEqual(POSTER);
    });

    test('Answers with 304 when the entry is not newer than If-Modified-Since, despite its milliseconds', async () => {
      const response = await request({ 'if-modified-since': 'Thu, 01 Oct 2026 08:00:00 GMT' });

      expect(response.statusCode).toBe(304);
    });

    test('Sends the content when the entry is newer than If-Modified-Since', async () => {
      const response = await request({ 'if-modified-since': 'Thu, 01 Oct 2026 07:59:59 GMT' });

      expect(response.statusCode).toBe(200);
    });

    test('Sends the content for an unparseable If-Modified-Since', async () => {
      const response = await request({ 'if-modified-since': 'yesterday' });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('range requests', () => {
    test('Sends the requested range with 206', async () => {
      const response = await request({ range: 'bytes=5-9' });

      expect(response.statusCode).toBe(206);
      expect(response.payload).toBe('56789');
      expect(response.headers['content-range']).toBe('bytes 5-9/20');
      expect(response.headers['content-length']).toBe('5');
    });

    test('Sends the last bytes for a suffix range', async () => {
      const response = await request({ range: 'bytes=-4' });

      expect(response.payload).toBe('ghij');
      expect(response.headers['content-range']).toBe('bytes 16-19/20');
    });

    test('Sends a range from an entry that was never stored', async () => {
      entry = new InMemoryCacheEntry(POSTER, CacheCodecs.bytes().decode, false, CREATED_AT, null, 'image/avif');

      const response = await request({ range: 'bytes=5-9' });

      expect(response.statusCode).toBe(206);
      expect(response.payload).toBe('56789');
    });

    test('Closes the file once the range is sent', async () => {
      await request({ range: 'bytes=5-9' });

      expect(isFileHandleClosed()).toBe(true);
    });

    describe('beyond the end of the entry', () => {
      test('Answers with 416, naming the entry\'s size', async () => {
        const response = await request({ range: 'bytes=20-29' });

        expect(response.statusCode).toBe(416);
        expect(response.headers['content-range']).toBe('bytes */20');
      });

      test('Closes the file', async () => {
        await request({ range: 'bytes=20-29' });

        expect(isFileHandleClosed()).toBe(true);
      });
    });

    test.for([
      { range: 'bytes=0-1,5-6' },
      { range: 'items=0-5' },
      { range: 'bytes=garbage' },
    ])('Sends the whole entry for Range: $range', async ({ range }) => {
      const response = await request({ range });

      expect(response.statusCode).toBe(200);
      expect(response.rawPayload).toEqual(POSTER);
    });

    test('Sends the range when If-Range names the current version', async () => {
      const response = await request({ 'range': 'bytes=5-9', 'if-range': '"d052861a-12ea-4df8-aad7-2f53ae4aef70"' });

      expect(response.statusCode).toBe(206);
    });

    test('Sends the whole entry when If-Range names an older version', async () => {
      const response = await request({ 'range': 'bytes=5-9', 'if-range': '"7b1f0c2e-6a4d-4e8b-9c3f-1d2e5a8b0c47"' });

      expect(response.statusCode).toBe(200);
      expect(response.rawPayload).toEqual(POSTER);
    });
  });

  describe('HEAD requests', () => {
    test('Sends the headers without a body', async () => {
      const response = await request({}, 'HEAD');

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-length']).toBe('20');
      expect(response.rawPayload).toHaveLength(0);
    });

    test('Closes the file', async () => {
      await request({}, 'HEAD');

      await vi.waitFor(() => expect(isFileHandleClosed()).toBe(true));
    });
  });
});
