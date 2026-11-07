import { z } from 'zod';

const ZOD_ERROR_SCHEMA = z.object({
  context: z.string()
    .optional()
    .describe('Validation errors only: the part of the request that failed, e.g. `querystring` or `params`'),
  issues: z.array(z.object({
    path: z.string()
      .describe('JSON pointer into the failed part, e.g. `/format`'),
    message: z.string(),
  }))
    .optional()
    .describe('Validation errors only'),
});

/** @internal */
export const API_ERROR_SCHEMA = z
  .object({
    error: z.string()
      .describe('Human-readable, not meant to be parsed'),

    ...ZOD_ERROR_SCHEMA.shape,
  })
  .meta({ id: 'ApiError' });
