import z from 'zod';

/** @internal */
export const xmlInt = z.string().regex(/^-?\d+$/).transform(Number);

/** @internal */
export const xmlNumber = z.string().regex(/^-?\d+(?:\.\d+)?$/).transform(Number);

/** @internal */
export const xmlBool = z.enum(['true', 'false', '1', '0']).transform((v) => v === 'true' || v === '1');

/** @internal */
export const xmlText = z.strictObject({ '#text': z.string() }).transform((v) => v['#text']);

/** @internal */
export function xmlArray<T extends z.ZodType>(schema: T) {
  return z.preprocess(
    (value) => value === undefined ? [] : (Array.isArray(value) ? value : [value]),
    z.array(schema),
  );
}

/** @internal */
export const multilineText = z.string().transform((value) => value.replace(/\r\n?/g, '\n'));

/** @internal */
export const simpleDate = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .transform((value) => {
    const [year, month, day] = value.split('-').map(Number);
    return { year, month, day };
  })
  .refine(isCalendarDate);

/** @internal */
export const partialSimpleDate = z.string()
  .regex(/^\d{4}(?:-\d{2}(?:-\d{2})?)?$/)
  .transform((value) => {
    const [year, month, day] = value.split('-').map(Number);
    return { year, month: month ?? null, day: day ?? null };
  })
  .refine(isCalendarDate);

function isCalendarDate({ year, month, day }: { year: number, month: number | null, day: number | null }): boolean {
  const date = new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === (month ?? 1) - 1
    && date.getUTCDate() === (day ?? 1);
}
