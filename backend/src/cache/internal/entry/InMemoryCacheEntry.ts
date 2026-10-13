import { Readable } from 'node:stream';
import type { CachedValue } from '../../CacheEntry.js';

/** @internal */
export class InMemoryCacheEntry<T> implements CachedValue<T> {
  public readonly isNull = false;

  constructor(
    private readonly payload: Buffer,
    private readonly decode: (payload: Buffer) => T,
    public readonly isStale: boolean,
    public readonly createdAt: Date,
    public readonly etag: string | null,
    public readonly contentType: string | null,
  ) {
  }

  get sizeBytes(): number {
    return this.payload.length;
  }

  async value(): Promise<T> {
    return this.decode(this.payload);
  }

  readBuffer(): Promise<Buffer> {
    return Promise.resolve(this.payload);
  }

  openReadStream(range?: { start: number; end: number }): Readable {
    const slice = range == null ? this.payload : this.payload.subarray(range.start, range.end + 1);
    return Readable.from([slice]);
  }

  close(): Promise<void> {
    return Promise.resolve();
  }

  [Symbol.asyncDispose](): Promise<void> {
    return this.close();
  }
}
