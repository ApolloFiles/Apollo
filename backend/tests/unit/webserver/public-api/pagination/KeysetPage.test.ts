import { BadRequestError } from '@sprax/node-framework';
import { z } from 'zod';
import { KeysetPage } from '#src/webserver/public-api/pagination/KeysetPage.js';

const BY_NAME = { column: 'name', order: 'asc', keySchema: z.string() } as const;
const BY_ID_DESC = { column: 'id', order: 'desc', keySchema: z.coerce.bigint() } as const;

const ANGEL_BEATS = { id: 7302000000000000001n, name: 'Angel Beats!' };
const BLACK_BULLET = { id: 7302000000000000002n, name: 'Black Bullet' };
const CHARLOTTE = { id: 7302000000000000003n, name: 'Charlotte' };

describe(KeysetPage, () => {
  describe('for the first page', () => {
    test('Adds no row condition and asks for one row more than the limit', () => {
      const page = KeysetPage.create({ listing: 'listMediaLibraries', limit: 2 }, BY_NAME);

      expect(page.where()).toEqual({});
      expect(page.take).toBe(3);
    });

    test('Orders by the column and then by id', () => {
      const page = KeysetPage.create({ listing: 'listMediaLibraries', limit: 2 }, BY_NAME);

      expect(page.orderBy()).toEqual([{ name: 'asc' }, { id: 'asc' }]);
    });

    test('Orders by id alone when id is the column', () => {
      const page = KeysetPage.create({ listing: 'listMedia', limit: 2 }, BY_ID_DESC);

      expect(page.orderBy()).toEqual([{ id: 'desc' }]);
    });
  });

  describe('when the rows exceed the limit', () => {
    test('Returns only the limit and a cursor for the last returned row', () => {
      const page = KeysetPage.create({ listing: 'listMediaLibraries', limit: 2 }, BY_NAME);

      const result = page.toPage([ANGEL_BEATS, BLACK_BULLET, CHARLOTTE], (row) => row.name);

      expect(result.items).toEqual(['Angel Beats!', 'Black Bullet']);
      expect(result.nextCursor).toEqual(expect.any(String));
    });

    test('Continues after the last returned row\'s column value and id on the next page', () => {
      const firstPage = KeysetPage.create({ listing: 'listMediaLibraries', limit: 2 }, BY_NAME);
      const { nextCursor } = firstPage.toPage([ANGEL_BEATS, BLACK_BULLET, CHARLOTTE], (row) => row.name);

      const secondPage = KeysetPage.create({ listing: 'listMediaLibraries', limit: 2, cursor: nextCursor! }, BY_NAME);

      expect(secondPage.where()).toEqual({
        OR: [
          { name: { gt: 'Black Bullet' } },
          { name: 'Black Bullet', id: { gt: BLACK_BULLET.id } },
        ],
      });
    });

    test('Continues below the last id when sorting by id descending', () => {
      const firstPage = KeysetPage.create({ listing: 'listMedia', limit: 1 }, BY_ID_DESC);
      const { nextCursor } = firstPage.toPage([CHARLOTTE, BLACK_BULLET], (row) => row.name);

      const secondPage = KeysetPage.create({ listing: 'listMedia', limit: 1, cursor: nextCursor! }, BY_ID_DESC);

      expect(secondPage.where()).toEqual({ id: { lt: CHARLOTTE.id } });
    });
  });

  test('Ends the listing without a cursor when the rows fit the limit', () => {
    const page = KeysetPage.create({ listing: 'listMediaLibraries', limit: 3 }, BY_NAME);

    const result = page.toPage([ANGEL_BEATS, BLACK_BULLET, CHARLOTTE], (row) => row.name);

    expect(result.nextCursor).toBeNull();
  });

  describe('when a cursor is reused elsewhere', () => {
    let cursor: string;

    beforeEach(() => {
      const page = KeysetPage.create({ listing: 'listMedia', limit: 1 }, BY_NAME, { libraryIds: ['7301000000000000001'] });
      cursor = page.toPage([ANGEL_BEATS, BLACK_BULLET], (row) => row.name).nextCursor!;
    });

    test('Rejects it for another listing', () => {
      expect(() => KeysetPage.create({ listing: 'listMediaLibraries', limit: 1, cursor }, BY_NAME, { libraryIds: ['7301000000000000001'] }))
        .toThrow(BadRequestError);
    });

    test('Rejects it for another sort order', () => {
      expect(() => KeysetPage.create({ listing: 'listMedia', limit: 1, cursor }, { ...BY_NAME, order: 'desc' }, { libraryIds: ['7301000000000000001'] }))
        .toThrow(BadRequestError);
    });

    test('Rejects it for other filters', () => {
      expect(() => KeysetPage.create({ listing: 'listMedia', limit: 1, cursor }, BY_NAME, { libraryIds: [] }))
        .toThrow(BadRequestError);
    });

    test('Accepts it for the same listing, sort and filters', () => {
      expect(() => KeysetPage.create({ listing: 'listMedia', limit: 1, cursor }, BY_NAME, { libraryIds: ['7301000000000000001'] }))
        .not.toThrow();
    });
  });
});
