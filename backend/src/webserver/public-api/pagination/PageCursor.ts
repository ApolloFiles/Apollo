import { BadRequestError } from '@sprax/node-framework';
import Crypto from 'node:crypto';
import { z } from 'zod';
import { API_ID_SCHEMA } from '../ApiIdSchema.js';

export type DecodedPageCursor<Key> = {
  key: Key;
  id: bigint;
};

/**
 * Opaque keyset cursor: the sort key and id of the last row of a page.
 * Instead of carrying the listing it belongs to, it carries a hash over listing, key and id,
 * so a cursor reused in another listing or edited by hand is rejected without the listing name bloating the cursor.
 * The hash is no signature: a client can still forge a cursor, which only moves the page start within rows it can see anyway.
 * @internal
 */
export class PageCursor {
  private static readonly VERSION = 1;
  private static readonly BINDING_LENGTH = 11;
  private static readonly PAYLOAD_SCHEMA = z.object({
    v: z.literal(PageCursor.VERSION),
    k: z.unknown(),
    i: API_ID_SCHEMA,
    h: z.string(),
  });

  static encode(scope: string, key: unknown, id: bigint): string {
    const serializedKey = PageCursor.serializeKey(key);
    const payload = { v: this.VERSION, k: serializedKey, i: id.toString(), h: this.createBinding(scope, serializedKey, id.toString()) };
    return Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url');
  }

  static decode<Key>(raw: string, scope: string, keySchema: z.ZodType<Key>): DecodedPageCursor<Key> {
    const payload = this.PAYLOAD_SCHEMA.safeParse(PageCursor.parseJson(raw));
    if (!payload.success) {
      throw new BadRequestError('Invalid cursor');
    }
    if (payload.data.h !== this.createBinding(scope, payload.data.k, payload.data.i)) {
      throw new BadRequestError('The cursor belongs to a different listing or different parameters');
    }

    const key = keySchema.safeParse(payload.data.k);
    if (!key.success) {
      throw new BadRequestError('Invalid cursor');
    }
    return { key: key.data, id: BigInt(payload.data.i) };
  }

  private static serializeKey(key: unknown): unknown {
    return typeof key === 'bigint' ? key.toString() : key;
  }

  private static createBinding(scope: string, serializedKey: unknown, id: string): string {
    return Crypto.createHash('sha256')
      .update(JSON.stringify([scope, serializedKey ?? null, id]))
      .digest('base64url')
      .slice(0, this.BINDING_LENGTH);
  }

  private static parseJson(raw: string): unknown {
    try {
      return JSON.parse(Buffer.from(raw, 'base64url').toString('utf-8'));
    } catch (err) {
      throw new BadRequestError('Invalid cursor', { cause: err });
    }
  }
}
