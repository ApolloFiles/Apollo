import { z } from 'zod';
import { baseOc } from '../SubContractHelpers.js';

export const FEEDBACK_REPORT_CATEGORY_SCHEMA = z.enum(['BUG', 'FEEDBACK']);
export const FEEDBACK_REPORT_STATUS_SCHEMA = z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'WONT_FIX']);

export const FEEDBACK_CONTEXT_SCHEMA = z.strictObject({
  url: z.string().max(2000),
  userAgent: z.string().max(1000),
  viewport: z.strictObject({
    width: z.number().int().nonnegative(),
    height: z.number().int().nonnegative(),
  }),
  clientErrors: z.array(z.strictObject({
    timestamp: z.string().max(64),
    message: z.string().max(2000),
  })).max(25),
  page: z.record(z.string(), z.unknown()).nullable(),
});

const submitFeedback = baseOc
  .input(z.strictObject({
    category: FEEDBACK_REPORT_CATEGORY_SCHEMA,
    message: z.string().trim().min(1).max(4000),
    context: FEEDBACK_CONTEXT_SCHEMA.nullable(),
  }))
  .output(z.strictObject({
    id: z.string(),
  }));

export const feedbackContract = {
  submit: submitFeedback,
};
