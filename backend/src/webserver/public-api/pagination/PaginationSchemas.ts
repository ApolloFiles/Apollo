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
    const maxLimit = limits.maxLimit ?? this.MAX_LIMIT;
    const defaultLimit = limits.defaultLimit ?? this.DEFAULT_LIMIT;

    return {
      limit: z.coerce.number()
        .int()
        .min(1)
        .max(maxLimit)
        .default(defaultLimit)
        .describe('Maximum number of items to return'),
      cursor: z.string()
        .max(1024)
        .optional()
        .describe('The `nextCursor` of the previous page. Opaque; only valid for the same listing and parameters.'),
    };
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
