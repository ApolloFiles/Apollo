import { BadRequestError } from '@sprax/node-framework';
import { z } from 'zod';
import { PageCursor } from '#src/webserver/public-api/pagination/PageCursor.js';

const SCOPE = '["listMediaLibraries","name","asc",{}]';

function decodeRaw(cursor: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf-8'));
}

function encodeRaw(payload: unknown): string {
  return Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url');
}

describe(PageCursor, () => {
  test('Decodes the key and id it encoded, keeping ids beyond the double range exact', () => {
    const cursor = PageCursor.encode(SCOPE, 'Anime – Summer 2024', 7301234567890123456n);

    expect(PageCursor.decode(cursor, SCOPE, z.string())).toEqual({ key: 'Anime – Summer 2024', id: 7301234567890123456n });
  });

  test('Carries a bigint key as a string so it can be decoded with a coercing schema', () => {
    const cursor = PageCursor.encode(SCOPE, 7302000000000000003n, 7302000000000000003n);

    expect(PageCursor.decode(cursor, SCOPE, z.coerce.bigint())).toEqual({ key: 7302000000000000003n, id: 7302000000000000003n });
  });

  test('Produces a cursor that is safe to use in a query string verbatim', () => {
    const cursor = PageCursor.encode(SCOPE, 'Movies & Shows/2024', 1n);

    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  test('Does not carry the listing name, only a short binding to it', () => {
    const cursor = PageCursor.encode(SCOPE, 'Anime', 1n);

    expect(JSON.stringify(decodeRaw(cursor))).not.toContain('listMediaLibraries');
    expect(decodeRaw(cursor).h).toHaveLength(11);
  });

  test('Rejects a cursor from a different listing', () => {
    const cursor = PageCursor.encode('["listMedia","title","asc",{}]', 'Anime', 1n);

    expect(() => PageCursor.decode(cursor, SCOPE, z.string()))
      .toThrow(new BadRequestError('The cursor belongs to a different listing or different parameters'));
  });

  test('Rejects a cursor whose key was altered after it was handed out', () => {
    const cursor = encodeRaw({ ...decodeRaw(PageCursor.encode(SCOPE, 'Anime', 1n)), k: 'Zombie' });

    expect(() => PageCursor.decode(cursor, SCOPE, z.string()))
      .toThrow(new BadRequestError('The cursor belongs to a different listing or different parameters'));
  });

  test('Rejects a cursor whose key does not fit the listing', () => {
    const cursor = PageCursor.encode(SCOPE, { addedAt: '2024-06-01T00:00:00Z' }, 1n);

    expect(() => PageCursor.decode(cursor, SCOPE, z.string())).toThrow(new BadRequestError('Invalid cursor'));
  });

  test('Rejects a cursor of another format version', () => {
    const cursor = encodeRaw({ ...decodeRaw(PageCursor.encode(SCOPE, 'Anime', 1n)), v: 2 });

    expect(() => PageCursor.decode(cursor, SCOPE, z.string())).toThrow(new BadRequestError('Invalid cursor'));
  });

  test('Rejects a cursor whose id is not numeric', () => {
    const cursor = encodeRaw({ ...decodeRaw(PageCursor.encode(SCOPE, 'Anime', 1n)), i: '1; DROP TABLE' });

    expect(() => PageCursor.decode(cursor, SCOPE, z.string())).toThrow(new BadRequestError('Invalid cursor'));
  });

  test('Rejects a cursor whose id does not fit an id column, before checking its binding', () => {
    const cursor = encodeRaw({ ...decodeRaw(PageCursor.encode(SCOPE, 'Anime', 1n)), i: '9223372036854775808' });

    expect(() => PageCursor.decode(cursor, SCOPE, z.string())).toThrow(new BadRequestError('Invalid cursor'));
  });

  test.for([
    { label: 'plain text', cursor: 'not-a-cursor' },
    { label: 'valid base64url of non-JSON', cursor: Buffer.from('<html>').toString('base64url') },
    { label: 'an empty string', cursor: '' },
  ])('Rejects $label as an invalid cursor', ({ cursor }) => {
    expect(() => PageCursor.decode(cursor, SCOPE, z.string())).toThrow(new BadRequestError('Invalid cursor'));
  });
});
