import { z } from 'zod';

/** Produced with `Date#toISOString()`, so no output validation is needed and the document stays free of a pattern */
export const API_TIMESTAMP_SCHEMA = z.string().meta({ format: 'date-time', description: 'ISO 8601 in UTC' });
