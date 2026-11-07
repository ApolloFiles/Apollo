import { z } from 'zod';
import { API_ID_SCHEMA } from '../../../../../public-api/ApiIdSchema.js';

/** @internal */
export const LIBRARY_ID_FILTER_SCHEMA = z.union([API_ID_SCHEMA, z.array(API_ID_SCHEMA)])
  .optional()
  .transform((libraryId) => (libraryId == null ? [] : [libraryId].flat()).map(BigInt))
  .describe('Repeat the parameter to filter by several libraries');
