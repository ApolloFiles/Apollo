import { z } from 'zod';
import { xmlInt } from '../xml/XmlSchemaHelpers.js';

/** @internal */
export const LOOKS_LIKE_ERROR_RESPONSE = /^\s*(?:<\?xml[^>]*\?>\s*)?<error[\s/>]/;

/** @internal */
export type AniDbErrorResponse = z.infer<typeof ERROR_RESPONSE_SCHEMA>;

/** @internal */
export const ERROR_RESPONSE_SCHEMA = z
  .strictObject({
    '?xml': z.unknown().optional(),

    error: z.strictObject({
      '#text': z.string().nonempty(),
      '@_code': xmlInt.optional(),
    }),
  })
  .transform((data) => {
    return {
      errorText: data.error['#text'],
      errorCode: data.error['@_code'],
    };
  });
