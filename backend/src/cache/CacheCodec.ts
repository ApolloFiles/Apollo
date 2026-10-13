import type { z } from 'zod';

export interface CacheCodec<T> {
  /** Decode before returning the entry, so failures become misses? */
  readonly decodeOnRead: boolean;

  readonly encode: (value: T) => Buffer;

  /** Should throw on corrupted/invalid data */
  readonly decode: (data: Buffer) => T;
}

/** What comes back from `JSON.parse(JSON.stringify(value))` unchanged; `undefined` properties are left out */
type JsonValue = string | number | boolean | null | readonly JsonValue[] | { readonly [key: string]: JsonValue | undefined };

const textCodec: CacheCodec<string> = {
  decodeOnRead: false,
  encode: (value) => Buffer.from(value, 'utf-8'),
  decode: (data) => data.toString('utf-8'),
};

export const CacheCodecs: {
  bytes(): CacheCodec<Buffer>,
  text(): CacheCodec<string>,
  /** Rejects (at compile time) schemas whose output type differs from their input, and values JSON cannot carry unchanged, like `z.date()` */
  json<T extends JsonValue>(schema: z.ZodType<T, T>): CacheCodec<T>,
} = {
  bytes() {
    return {
      decodeOnRead: false,
      encode: (value) => value,
      decode: (data) => data,
    };
  },

  text: () => textCodec,

  json(schema) {
    return {
      decodeOnRead: true,
      encode: (value) => textCodec.encode(JSON.stringify(value)),
      decode: (data) => schema.parse(JSON.parse(textCodec.decode(data))),
    };
  },
};
