import type { FileHandle } from 'node:fs/promises';
import type { Readable } from 'node:stream';
import type { CacheCodec } from '../../CacheCodec.js';
import type { CachedValue } from '../../CacheEntry.js';

/** @internal */
export class FileCacheEntry<T> implements CachedValue<T> {
  public readonly isNull = false;
  private consumed = false;

  constructor(
    private readonly fileHandle: FileHandle,
    private readonly codec: CacheCodec<T>,
    public readonly isStale: boolean,
    public readonly createdAt: Date,
    public readonly etag: string,
    public readonly contentType: string | null,
    public readonly sizeBytes: number,
  ) {
  }

  /** Consumes the file descriptor */
  async value(): Promise<T> {
    return this.codec.decode(await this.readBuffer());
  }

  /** Consumes the file descriptor */
  async readBuffer(): Promise<Buffer> {
    this.markConsumed();
    try {
      return await this.fileHandle.readFile();
    } finally {
      await this.fileHandle.close();
    }
  }

  /** Consumes the file descriptor */
  openReadStream(range?: { start: number; end: number }): Readable {
    this.markConsumed();
    return this.fileHandle.createReadStream({ start: range?.start, end: range?.end });
  }

  async close(): Promise<void> {
    if (this.consumed) {
      return;
    }

    this.consumed = true;
    await this.fileHandle.close();
  }

  [Symbol.asyncDispose](): Promise<void> {
    return this.close();
  }

  private markConsumed(): void {
    if (this.consumed) {
      throw new Error('Cache entry has already been consumed or closed');
    }
    this.consumed = true;
  }
}
