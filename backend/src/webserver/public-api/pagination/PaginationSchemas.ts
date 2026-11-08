import { z } from 'zod';

export type PaginationLimits = {
  defaultLimit?: number;
  maxLimit?: number;
};

/** @internal */
export class PaginationSchemas {
  static readonly DEFAULT_LIMIT = 50;
  static readonly MAX_LIMIT = 100;

  /** Spread into a list route's `querystring` object */
  static createQuery(limits: PaginationLimits = {}) {
    return {
      limit: this.createLimit(limits),
      cursor: z.string()
        .max(1024)
        .optional()
        .describe('The `nextCursor` of the previous page. Opaque; only valid for the same listing and parameters.'),
    };
  }

  /** For a listing that is limited but not paginated */
  static createLimit(limits: PaginationLimits = {}) {
    return z.coerce.number()
      .int()
      .min(1)
      .max(limits.maxLimit ?? this.MAX_LIMIT)
      .default(limits.defaultLimit ?? this.DEFAULT_LIMIT)
      .describe('Maximum number of items to return');
  }

  static createResponse<T extends z.ZodType>(itemSchema: T, id: string) {
    return z.object({
      nextCursor: z.string()
        .nullable()
        .describe('Pass as `cursor` to fetch the next page. `null` means there is no further page.'),
      items: z.array(itemSchema),
    }).meta({ id });
  }
}
