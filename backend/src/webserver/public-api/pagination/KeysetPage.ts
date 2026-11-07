import type { z } from 'zod';
import { PageCursor, type DecodedPageCursor } from './PageCursor.js';
import type { PageRequest } from './PageRequest.js';

export type SortOrder = 'asc' | 'desc';
export type Page<Item> = { nextCursor: string | null, items: Item[] };

export type KeysetSort<Column extends string, Key> = {
  column: Column;
  order: SortOrder;
  keySchema: z.ZodType<Key>;
};

type OrderByEntry<Column extends string> = Partial<Record<Column | 'id', SortOrder>>;

/**
 * One page of a keyset-paginated listing ordered by `column` with `id` as the tie-break.
 * Supplies the query fragments (`where`, `orderBy`, `take`) and turns the fetched rows into a page with its next cursor.
 * @internal
 */
export class KeysetPage<Column extends string, Key> {
  private constructor(
    private readonly scope: string,
    private readonly column: Column,
    private readonly order: SortOrder,
    private readonly after: DecodedPageCursor<Key> | null,
    private readonly limit: number,
  ) {
  }

  /**
   * @param request
   * @param sort
   * @param filters Everything besides sort and order that changes which rows are listed; a cursor is only valid for the same values
   * @throws {import('@sprax/node-framework').BadRequestError} If the request's cursor is invalid or belongs to another listing
   */
  static create<Column extends string, Key>(
    request: PageRequest,
    sort: KeysetSort<Column, Key>,
    filters: Record<string, unknown> = {},
  ): KeysetPage<Column, Key> {
    const scope = JSON.stringify([request.listing, sort.column, sort.order, filters]);
    const after = request.cursor != null ? PageCursor.decode(request.cursor, scope, sort.keySchema) : null;
    return new KeysetPage(scope, sort.column, sort.order, after, request.limit);
  }

  get take(): number {
    return this.limit + 1;
  }

  /** `Where` is the model's Prisma where-input; the fragment uses a dynamic column name, so it cannot be typed against it here */
  where<Where>(): Where {
    if (this.after == null) {
      return {} as Where;
    }
    if (this.column === 'id') {
      return { id: this.compare(this.after.id) } as Where;
    }
    return {
      OR: [
        { [this.column]: this.compare(this.after.key) },
        { [this.column]: this.after.key, id: this.compare(this.after.id) },
      ],
    } as Where;
  }

  orderBy(): OrderByEntry<Column>[] {
    if (this.column === 'id') {
      return [{ id: this.order } as OrderByEntry<Column>];
    }
    return [{ [this.column]: this.order } as OrderByEntry<Column>, { id: this.order } as OrderByEntry<Column>];
  }

  toPage<Row extends { id: bigint } & Record<Column, Key>, Item>(rows: Row[], toItem: (row: Row) => Item): Page<Item> {
    const pageRows = rows.slice(0, this.limit);
    const lastRow = rows.length > this.limit ? pageRows.at(-1) : undefined;

    return {
      nextCursor: lastRow != null ? PageCursor.encode(this.scope, lastRow[this.column], lastRow.id) : null,
      items: pageRows.map(toItem),
    };
  }

  private compare<T>(value: T): { gt: T } | { lt: T } {
    return this.order === 'asc' ? { gt: value } : { lt: value };
  }
}
