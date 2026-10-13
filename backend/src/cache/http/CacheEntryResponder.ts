import { NotFoundError } from '@sprax/node-framework';
import type { FastifyReply, FastifyRequest } from 'fastify';
import rangeParser from 'range-parser';
import { singleton } from 'tsyringe';
import type { CachedValue, CacheEntry } from '../CacheEntry.js';

export interface CacheEntryResponseOptions {
  /** e.g. `private, max-age=300` */
  cacheControl?: string;
}

interface ByteRange {
  start: number;
  end: number;
}

// TODO: Reading this class feels a bit hard... Maybe we can simplify/refactor it a bit
//       actually, we need similar classes for VirtualFile and just file paths (e.g. live transcode files),
//       so a lot of shared logic can probably be extracted that way

/** Answers a request with a cache entry, consuming or closing the entry */
@singleton()
export class CacheEntryResponder {
  /**
   * @throws NotFoundError
   */
  async send(request: FastifyRequest, reply: FastifyReply, entry: CacheEntry<unknown>, options: CacheEntryResponseOptions = {}): Promise<FastifyReply> {
    if (entry.isNull) {
      await entry[Symbol.asyncDispose]();
      throw new NotFoundError();
    }

    this.setCachingHeaders(reply, entry, options);
    if (this.isNotModified(request, entry)) {
      await entry.close();
      return reply.status(304).send();
    }

    reply
      .type(entry.contentType ?? 'application/octet-stream')
      .header('Accept-Ranges', 'bytes');

    const range = this.parseRange(request, entry);
    if (range === 'unsatisfiable') {
      await entry.close();
      return reply
        .status(416)
        .header('Content-Range', `bytes */${entry.sizeBytes}`)
        .send();
    }
    return range == null ? this.sendWhole(reply, entry) : this.sendRange(reply, entry, range);
  }

  private setCachingHeaders(reply: FastifyReply, entry: CachedValue<unknown>, options: CacheEntryResponseOptions): void {
    reply.header('Last-Modified', entry.createdAt.toUTCString());
    if (entry.etag != null) {
      reply.header('ETag', this.toEtagHeader(entry.etag));
    }
    if (options.cacheControl != null) {
      reply.header('Cache-Control', options.cacheControl);
    }
  }

  private isNotModified(request: FastifyRequest, entry: CachedValue<unknown>): boolean {
    const ifNoneMatch = request.headers['if-none-match'];
    if (ifNoneMatch != null) {
      return entry.etag != null && this.matchesEtag(ifNoneMatch, entry.etag);
    }

    const ifModifiedSince = Date.parse(request.headers['if-modified-since'] ?? '');
    return !Number.isNaN(ifModifiedSince) && Math.floor(entry.createdAt.getTime() / 1000) * 1000 <= ifModifiedSince;
  }

  /** Null for the whole entry: no range, one the client's copy no longer matches, or several (no multipart) */
  private parseRange(request: FastifyRequest, entry: CachedValue<unknown>): ByteRange | 'unsatisfiable' | null {
    const rangeHeader = request.headers.range;
    if (rangeHeader == null || !this.matchesIfRange(request, entry)) {
      return null;
    }

    const ranges = rangeParser(entry.sizeBytes, rangeHeader, { combine: true });
    if (ranges === -1) {
      return 'unsatisfiable';
    }
    if (ranges === -2 || ranges.type !== 'bytes' || ranges.length !== 1) {
      return null;
    }
    return ranges[0];
  }

  private matchesIfRange(request: FastifyRequest, entry: CachedValue<unknown>): boolean {
    const ifRange = request.headers['if-range'];
    return ifRange == null
      || (entry.etag != null && ifRange === this.toEtagHeader(entry.etag))
      || ifRange === entry.createdAt.toUTCString();
  }

  private sendWhole(reply: FastifyReply, entry: CachedValue<unknown>): FastifyReply {
    return reply
      .header('Content-Length', entry.sizeBytes)
      .send(entry.openReadStream());
  }

  private sendRange(reply: FastifyReply, entry: CachedValue<unknown>, range: ByteRange): FastifyReply {
    return reply
      .status(206)
      .header('Content-Range', `bytes ${range.start}-${range.end}/${entry.sizeBytes}`)
      .header('Content-Length', range.end - range.start + 1)
      .send(entry.openReadStream(range));
  }

  private toEtagHeader(etag: string): string {
    return `"${etag}"`;
  }

  /** Weak comparison, as RFC 9110 prescribes for `If-None-Match` */
  private matchesEtag(ifNoneMatch: string, etag: string): boolean {
    return ifNoneMatch.trim() === '*'
      || ifNoneMatch.split(',').some((candidate) => candidate.trim().replace(/^W\//, '') === this.toEtagHeader(etag));
  }
}
