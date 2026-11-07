import { z } from 'zod';

/** Ids are Postgres `int8` columns */
const MAX_ID = 2n ** 63n - 1n;

/**
 * Ids are opaque strings to clients, so the document says "string" and nothing more;
 * the refinement is invisible to the OpenAPI generator but still rejects anything that cannot be an id
 *
 * @internal
 */
export const API_ID_SCHEMA = z.string()
  .min(1)
  .refine((id) => /^\d{1,19}$/.test(id) && BigInt(id) <= MAX_ID, 'Invalid id');
