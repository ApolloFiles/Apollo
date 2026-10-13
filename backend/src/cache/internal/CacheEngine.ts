import { TimeUnit } from '@spraxdev/node-commons/util';
import Fs from 'node:fs';
import { InFlightRequestTracker } from '../../utils/InFlightRequestTracker.js';
import { NodeFsUtils } from '../../utils/NodeFsUtils.js';
import { type CacheDefinition, validateCacheDefinition } from '../CacheDefinition.js';
import type { CacheEntry } from '../CacheEntry.js';
import { type CacheExpiry, ensureValidCacheExpiry, toExpiryDates } from '../CacheExpiry.js';
import {
  type CacheFactory,
  type CacheGetOrCreateOptions,
  type CacheWriteOptions,
  TempFileWritten,
} from '../CacheFactory.js';
import type { CacheFileLocation } from './CacheFileStorage.js';
import type { CacheServices } from './CacheServices.js';
import type { CacheIndexRow } from './database/CacheIndexRow.js';
import type { CacheIndexPayload } from './database/CacheIndexWrite.js';
import type { ScopedCacheIndex } from './database/ScopedCacheIndex.js';
import { FileCacheEntry } from './entry/FileCacheEntry.js';
import { InMemoryCacheEntry } from './entry/InMemoryCacheEntry.js';
import { NullCacheEntry } from './entry/NullCacheEntry.js';

/** @internal */
export interface CacheScope {
  readonly index: ScopedCacheIndex;
  readonly userId: string | null;
}

interface EngineWriteOptions extends CacheWriteOptions {
  groupKey?: string;
  validator?: string;
}

interface EngineGetOrCreateOptions extends CacheGetOrCreateOptions, EngineWriteOptions {
}

type Freshness = 'fresh' | 'stale' | 'expired';
type FlightOutcome = { stored: true } | { stored: false, payload: Buffer | null };

/**
 * Storage failures never reach the caller: they become misses, or uncached results, and are logged
 * @internal
 */
export class CacheEngine<T extends {} | null> {
  private static readonly TOUCH_INTERVAL_MS = TimeUnit.DAYS.toMillis(1);

  private readonly inFlightRequestTracker = new InFlightRequestTracker<FlightOutcome>();

  constructor(
    private readonly services: CacheServices,
    private readonly definition: CacheDefinition<T>,
  ) {
    validateCacheDefinition(definition);
  }

  get(scope: CacheScope, key: string, validator?: string): Promise<CacheEntry<T> | undefined> {
    return this.fallBackOnError(
      `Cache lookup in ${this.describe(key)} failed – treating it as a miss`,
      undefined,
      () => this.lookup(scope, key, validator, true),
    );
  }

  async getOrCreate(scope: CacheScope, key: string, factory: CacheFactory<T>, options: EngineGetOrCreateOptions = {}): Promise<CacheEntry<T>> {
    this.validateWriteOptions(key, options);

    const existingEntry = await this.get(scope, key, options.validator);
    if (existingEntry != null && !existingEntry.isStale) {
      return existingEntry;
    }
    if (existingEntry != null && options.serveStaleOnError) {
      return this.refreshOrServeStale(scope, key, factory, options, existingEntry);
    }

    await existingEntry?.[Symbol.asyncDispose]();
    return this.createAndGet(scope, key, factory, options);
  }

  async set(scope: CacheScope, key: string, value: T, options: EngineWriteOptions = {}): Promise<void> {
    this.validateWriteOptions(key, options);

    await this.fallBackOnError(`Could not write ${this.describe(key)}`, undefined, async () => {
      await this.withTempFile((fileId, tempPath) => this.store(scope, key, fileId, tempPath, value, options));
    });
  }

  async delete(scope: CacheScope, key: string): Promise<void> {
    await this.fallBackOnError(
      `Could not delete ${this.describe(key)}`,
      undefined,
      async () => {
        const row = await this.findRow(scope, key);
        if (row != null) {
          await this.services.cacheEntryDeleter.deleteEntry(scope.index, row);
        }
      },
    );
  }

  private async lookup(scope: CacheScope, key: string, validator: string | undefined, retryOnMissingFile: boolean): Promise<CacheEntry<T> | undefined> {
    const row = await this.findRow(scope, key);
    if (row == null) {
      return undefined;
    }

    if (validator !== undefined && row.validator !== validator) {
      await this.services.cacheEntryDeleter.deleteEntry(scope.index, row);
      return undefined;
    }

    const freshness = await this.determineFreshness(row);
    if (freshness === 'expired') {
      return undefined;
    }

    if (row.isNull) {
      this.touchIfDue(scope, row);
      return this.toNullEntry(freshness === 'stale', row.createdAt);
    }

    const fileHandle = await NodeFsUtils.nullIfMissing(this.services.cacheFileStorage.open(this.toLocation(scope, row.fileId!)));
    if (fileHandle == null) {
      // Usually a concurrent overwrite deleted the file after we read the row; the second attempt sees the new row
      if (retryOnMissingFile) {
        return this.lookup(scope, key, validator, false);
      }

      await this.discardBrokenEntry(scope, row, 'its file is missing');
      return undefined;
    }

    try {
      return await this.toFileBackedEntry(scope, row, freshness === 'stale', fileHandle);
    } catch (err) {
      await fileHandle.close();
      throw err;
    }
  }

  private async toFileBackedEntry(scope: CacheScope, row: CacheIndexRow, isStale: boolean, fileHandle: Fs.promises.FileHandle): Promise<CacheEntry<T> | undefined> {
    const { size } = await fileHandle.stat();
    if (size !== row.sizeBytes) {
      await fileHandle.close();
      await this.discardBrokenEntry(scope, row, `its file has ${size} instead of ${row.sizeBytes} bytes`);
      return undefined;
    }

    this.touchIfDue(scope, row);

    if (!this.definition.codec.decodeOnRead) {
      return new FileCacheEntry(fileHandle, this.definition.codec, isStale, row.createdAt, row.fileId!, row.contentType, row.sizeBytes);
    }

    const payload = await this.readAndClose(fileHandle);
    let value: NonNullable<T>;
    try {
      value = this.definition.codec.decode(payload);
    } catch (err) {
      console.warn(`[WARN] Could not decode ${this.describe(row.key)} – deleting it:`, err);
      await this.services.cacheEntryDeleter.deleteEntry(scope.index, row);
      return undefined;
    }

    return new InMemoryCacheEntry(payload, () => value, isStale, row.createdAt, row.fileId, row.contentType);
  }

  /** The stale entry stays open while the factory runs, so it can still be served */
  private async refreshOrServeStale(scope: CacheScope, key: string, factory: CacheFactory<T>, options: EngineGetOrCreateOptions, staleEntry: CacheEntry<T>): Promise<CacheEntry<T>> {
    let createdEntry: CacheEntry<T>;
    try {
      createdEntry = await this.createAndGet(scope, key, factory, options);
    } catch (err) {
      if (this.mayServeStaleOn(err, options)) {
        console.warn(`[WARN] Refreshing ${this.describe(key)} failed – serving the stale entry:`, err);
        return staleEntry;
      }

      await this.closeStaleEntry(key, staleEntry);
      throw err;
    }

    await this.closeStaleEntry(key, staleEntry);
    return createdEntry;
  }

  private mayServeStaleOn(err: unknown, options: EngineGetOrCreateOptions): boolean {
    const { serveStaleOnError } = options;
    return typeof serveStaleOnError === 'function' ? serveStaleOnError(err) : serveStaleOnError === true;
  }

  private async closeStaleEntry(key: string, staleEntry: CacheEntry<T>): Promise<void> {
    await this.fallBackOnError(`Could not close the stale entry of ${this.describe(key)}`, undefined, async () => {
      await staleEntry[Symbol.asyncDispose]();
    });
  }

  private async createAndGet(scope: CacheScope, key: string, factory: CacheFactory<T>, options: EngineGetOrCreateOptions): Promise<CacheEntry<T>> {
    for (let attempt = 1; attempt <= 2; ++attempt) {
      // The flight returns no entry: an entry owns a file descriptor, and every caller needs its own.
      // Callers that saw another version of the source file must not share a flight, or they would discard each other's entry.
      const outcome = await this.inFlightRequestTracker.run(
        JSON.stringify([scope.userId, key, options.validator ?? null]),
        () => this.compute(scope, key, factory, options),
      );
      if (!outcome.stored) {
        return this.toUncachedEntry(outcome.payload, options);
      }

      const entry = await this.get(scope, key, options.validator);
      if (entry != null) {
        return entry;
      }
    }

    throw new Error(`Cache entry ${this.describe(key)} disappeared right after it was stored, twice`);
  }

  private async compute(scope: CacheScope, key: string, factory: CacheFactory<T>, options: EngineGetOrCreateOptions): Promise<FlightOutcome> {
    if (await this.hasFreshEntry(scope, key, options.validator)) {
      return { stored: true };
    }

    return this.withTempFile(async (fileId, tempPath) => {
      const result = await factory({ tempPath, fromTempFile: () => TempFileWritten.create() });
      return this.store(scope, key, fileId, tempPath, result, options);
    });
  }

  /** Only throws for errors of the value itself (encoding) or when even the uncached payload cannot be read back */
  private async store(scope: CacheScope, key: string, fileId: string, tempPath: string, result: T | TempFileWritten, options: EngineWriteOptions): Promise<FlightOutcome> {
    if (result === null) {
      return this.storeNull(scope, key, options);
    }

    const encodedValue = result instanceof TempFileWritten ? null : this.definition.codec.encode(result);
    try {
      await this.storeFile(scope, key, fileId, tempPath, encodedValue, options);
      return { stored: true };
    } catch (err) {
      console.warn(`[WARN] Could not store ${this.describe(key)}, so it is not cached:`, err);
      return { stored: false, payload: await this.salvagePayload(scope, key, fileId, tempPath, encodedValue) };
    }
  }

  private async storeFile(scope: CacheScope, key: string, fileId: string, tempPath: string, encodedValue: Buffer | null, options: EngineWriteOptions): Promise<void> {
    if (encodedValue != null) {
      await this.services.cacheFileStorage.writeTemp(tempPath, encodedValue);
    }

    const { size } = await Fs.promises.stat(tempPath);
    await this.services.cacheFileStorage.moveIntoPlace(tempPath, this.toLocation(scope, fileId));

    const payload = { fileId, sizeBytes: size, contentType: this.determineContentType(options) };
    await this.writeRow(scope, key, payload, options.expiry ?? this.definition.expiry, options);
  }

  private storeNull(scope: CacheScope, key: string, options: EngineWriteOptions): Promise<FlightOutcome> {
    return this.fallBackOnError<FlightOutcome>(`Could not store ${this.describe(key)}, so it is not cached`, { stored: false, payload: null }, async () => {
      const expiry = options.nullExpiry ?? this.definition.nullExpiry ?? options.expiry ?? this.definition.expiry;
      await this.writeRow(scope, key, null, expiry, options);
      return { stored: true };
    });
  }

  private async writeRow(scope: CacheScope, key: string, payload: CacheIndexPayload | null, expiry: CacheExpiry, options: EngineWriteOptions): Promise<void> {
    const now = await this.services.databaseClient.fetchNow();
    const { previousFileId } = await scope.index.upsertReturningPrevious({
      namespace: this.definition.namespace,
      version: this.definition.version,
      key,
      groupKey: options.groupKey ?? null,
      validator: options.validator ?? null,
      payload,
      writtenAt: now,
      ...toExpiryDates(now, expiry),
    });

    await this.deleteReplacedFile(scope, previousFileId);
  }

  /** The file was either never moved out of the temp directory, or moved but its row never committed */
  private async salvagePayload(scope: CacheScope, key: string, fileId: string, tempPath: string, encodedValue: Buffer | null): Promise<Buffer> {
    const payload = encodedValue
      ?? await NodeFsUtils.nullIfMissing(Fs.promises.readFile(tempPath))
      ?? await this.readAndClose(await this.services.cacheFileStorage.open(this.toLocation(scope, fileId)));

    await this.deleteUncommittedFile(scope, key, fileId);
    return payload;
  }

  /** Keeps the file if the row was committed after all (the error came later), or if that cannot be told */
  private async deleteUncommittedFile(scope: CacheScope, key: string, fileId: string): Promise<void> {
    await this.fallBackOnError(`Could not tell whether ${this.describe(key)} was stored – leaving its file to the verify job`, undefined, async () => {
      const row = await this.findRow(scope, key);
      if (row?.fileId !== fileId) {
        await this.services.cacheEntryDeleter.deleteFilesOf([this.toLocation(scope, fileId)]);
      }
    });
  }

  private hasFreshEntry(scope: CacheScope, key: string, validator: string | undefined): Promise<boolean> {
    return this.fallBackOnError(`Checking for a fresh ${this.describe(key)} failed – running its factory anyway`, false, async () => {
      const row = await this.findRow(scope, key);
      return row != null
        && (validator === undefined || row.validator === validator)
        && await this.determineFreshness(row) === 'fresh';
    });
  }

  private async determineFreshness(row: CacheIndexRow): Promise<Freshness> {
    if (row.freshUntil == null && row.keepUntil == null) {
      return 'fresh';
    }

    const now = await this.services.databaseClient.fetchNow();
    if (row.keepUntil != null && row.keepUntil <= now) {
      return 'expired';
    }
    if (row.freshUntil != null && row.freshUntil <= now) {
      return 'stale';
    }
    return 'fresh';
  }

  private async discardBrokenEntry(scope: CacheScope, row: CacheIndexRow, reason: string): Promise<void> {
    this.services.cacheMissCounter.record();

    if (!await this.services.cacheFileStorage.hasRootMarker()) {
      console.error(
        `[ERROR] Keeping ${this.describe(row.key)} although ${reason}: the cache directory lacks its marker file, ` +
        'so it may be unavailable right now (e.g. an unmounted share)',
      );
      return;
    }

    console.warn(`[WARN] Discarding ${this.describe(row.key)} because ${reason}`);
    await this.services.cacheEntryDeleter.deleteEntry(scope.index, row);
  }

  private touchIfDue(scope: CacheScope, row: CacheIndexRow): void {
    if (Date.now() - row.lastAccessedAt.getTime() < CacheEngine.TOUCH_INTERVAL_MS) {
      return;
    }

    scope.index.touch(row.id)
      .catch((err) => console.warn(`[WARN] Could not update the last access of ${this.describe(row.key)}:`, err));
  }

  private async deleteReplacedFile(scope: CacheScope, previousFileId: string | null): Promise<void> {
    await this.services.cacheEntryDeleter.deleteFilesOf([{
      userId: scope.userId,
      namespace: this.definition.namespace,
      version: this.definition.version,
      fileId: previousFileId,
    }]);
  }

  private validateWriteOptions(key: string, options: EngineWriteOptions): void {
    for (const expiry of [options.expiry, options.nullExpiry]) {
      if (expiry != null) {
        ensureValidCacheExpiry(expiry, this.describe(key));
      }
    }
  }

  private toUncachedEntry(payload: Buffer | null, options: EngineWriteOptions): CacheEntry<T> {
    if (payload == null) {
      return this.toNullEntry(false, new Date());
    }
    return new InMemoryCacheEntry(payload, (data) => this.definition.codec.decode(data), false, new Date(), null, this.determineContentType(options));
  }

  /** Only reached for a `T` that includes `null`: nothing else can store a null */
  private toNullEntry(isStale: boolean, createdAt: Date): CacheEntry<T> {
    return new NullCacheEntry(isStale, createdAt) as unknown as CacheEntry<T>;
  }

  private determineContentType(options: EngineWriteOptions): string | null {
    return options.contentType ?? this.definition.contentType ?? null;
  }

  private findRow(scope: CacheScope, key: string): Promise<CacheIndexRow | null> {
    return scope.index.find(this.definition.namespace, this.definition.version, key);
  }

  private toLocation(scope: CacheScope, fileId: string): CacheFileLocation {
    return { userId: scope.userId, namespace: this.definition.namespace, version: this.definition.version, fileId };
  }

  private async withTempFile<R>(task: (fileId: string, tempPath: string) => Promise<R>): Promise<R> {
    const { fileId, tempPath } = await this.services.cacheFileStorage.allocateTemp();
    try {
      return await task(fileId, tempPath);
    } finally {
      await this.deleteTemp(tempPath);
    }
  }

  private async fallBackOnError<R>(warning: string, fallback: R, task: () => Promise<R>): Promise<R> {
    try {
      return await task();
    } catch (err) {
      console.warn(`[WARN] ${warning}:`, err);
      return fallback;
    }
  }

  private async readAndClose(fileHandle: Fs.promises.FileHandle): Promise<Buffer> {
    try {
      return await fileHandle.readFile();
    } finally {
      await fileHandle.close();
    }
  }

  private async deleteTemp(tempPath: string): Promise<void> {
    await this.services.cacheFileStorage.deleteTemp(tempPath)
      .catch((err) => console.warn(`[WARN] Could not delete cache temp file ${tempPath}:`, err));
  }

  private describe(key: string): string {
    return `${this.definition.namespace}@${this.definition.version} '${key}'`;
  }
}
