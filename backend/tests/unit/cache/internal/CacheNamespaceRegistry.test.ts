import { AppCache } from '#src/cache/AppCache.js';
import { CacheCodecs } from '#src/cache/CacheCodec.js';
import { FileContentCache } from '#src/cache/FileContentCache.js';
import { CacheNamespaceRegistry } from '#src/cache/internal/CacheNamespaceRegistry.js';
import type { CacheServices } from '#src/cache/internal/CacheServices.js';
import { UserCache } from '#src/cache/UserCache.js';
import { createStrictDeepMock } from '#tests/test-helpers.js';
import { TimeUnit } from '@spraxdev/node-commons/util';
import type { DeepMockProxy } from 'vitest-mock-extended';

class AnimeXmlCache extends AppCache<string> {
  constructor(services: CacheServices) {
    super(services, { namespace: 'anidb.anime-xml', version: 1, codec: CacheCodecs.text(), expiry: { freshMs: TimeUnit.DAYS.toMillis(1) } });
  }
}

class WatchHistoryCache extends UserCache<string> {
  constructor(services: CacheServices, namespace = 'media.watch-history', version = 3) {
    super(services, { namespace, version, codec: CacheCodecs.text(), expiry: 'never' });
  }
}

class ThumbnailCache extends FileContentCache<Buffer> {
  constructor(services: CacheServices, version = 2) {
    super(services, { namespace: 'media.thumbnail', version, codec: CacheCodecs.bytes(), expiry: 'never' });
  }
}

describe(CacheNamespaceRegistry, () => {
  let registry: CacheNamespaceRegistry;
  let services: DeepMockProxy<CacheServices>;

  beforeEach(() => {
    registry = new CacheNamespaceRegistry();
    services = createStrictDeepMock<CacheServices>();
    services.cacheNamespaceRegistry.register.mockImplementation((cache) => registry.register(cache));
  });

  test('Knows the registered versions of every namespace', () => {
    new AnimeXmlCache(services);
    new WatchHistoryCache(services);
    new ThumbnailCache(services);

    expect(registry.getRegisteredVersions()).toEqual(new Map([
      ['anidb.anime-xml', new Set([1])],
      ['media.watch-history', new Set([3])],
      ['media.thumbnail', new Set([2])],
    ]));
  });

  test('Accepts a namespace registered in several versions', () => {
    new WatchHistoryCache(services);
    new WatchHistoryCache(services, 'media.watch-history', 4);

    expect(registry.getRegisteredVersions().get('media.watch-history')).toEqual(new Set([3, 4]));
  });

  test('Rejects a namespace registered twice in the same version, naming the second cache', () => {
    new WatchHistoryCache(services);

    expect(() => new WatchHistoryCache(services))
      .toThrow('Cache namespace \'media.watch-history\' version 3 is registered more than once (WatchHistoryCache)');
  });

  test('Rejects a cache registered after startup, naming its class', () => {
    registry.close();

    expect(() => new WatchHistoryCache(services))
      .toThrow('Cache namespace \'media.watch-history\' version 3 is registered after startup (WatchHistoryCache)');
  });

  test('Lists only the namespaces of file-content caches as such', () => {
    new AnimeXmlCache(services);
    new WatchHistoryCache(services);
    new ThumbnailCache(services);

    expect(registry.getFileContentNamespaces()).toEqual(['media.thumbnail']);
  });

  test('Lists a file-content namespace registered in several versions once', () => {
    new ThumbnailCache(services);
    new ThumbnailCache(services, 3);

    expect(registry.getFileContentNamespaces()).toEqual(['media.thumbnail']);
  });
});
