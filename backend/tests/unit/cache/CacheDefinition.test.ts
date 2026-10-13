import { CacheCodecs } from '#src/cache/CacheCodec.js';
import { type CacheDefinition, validateCacheDefinition } from '#src/cache/CacheDefinition.js';
import { TimeUnit } from '@spraxdev/node-commons/util';

function createDefinition(namespace: string, version: number): CacheDefinition<string> {
  return { namespace, version, codec: CacheCodecs.text(), expiry: 'never' };
}

describe(validateCacheDefinition, () => {
  test.for([
    { namespace: 'anidb.anime-xml' },
    { namespace: 'tmdb.api_config' },
    { namespace: '9anime' },
    { namespace: 'a'.repeat(100) },
  ])('Accepts the namespace $namespace', ({ namespace }) => {
    expect(() => validateCacheDefinition(createDefinition(namespace, 1))).not.toThrow();
  });

  test.for([
    { namespace: '' },
    { namespace: 'AniDB.anime-xml' },
    { namespace: 'anidb.anime-xml@2' },
    { namespace: '.hidden' },
    { namespace: '-anidb' },
    { namespace: 'media/thumbnail' },
    { namespace: 'media thumbnail' },
    { namespace: 'a'.repeat(101) },
  ])('Rejects the namespace "$namespace"', ({ namespace }) => {
    expect(() => validateCacheDefinition(createDefinition(namespace, 1))).toThrow(`Invalid cache namespace '${namespace}'`);
  });

  test.for([
    { version: 0 },
    { version: -1 },
    { version: 1.5 },
    { version: Number.NaN },
  ])('Rejects the version $version', ({ version }) => {
    expect(() => validateCacheDefinition(createDefinition('anidb.anime-xml', version))).toThrow(`Invalid version ${version} for cache namespace 'anidb.anime-xml'`);
  });

  test('Accepts a positive integer version', () => {
    expect(() => validateCacheDefinition(createDefinition('anidb.anime-xml', 42))).not.toThrow();
  });

  test.for([
    { expiry: { freshMs: TimeUnit.DAYS.toMillis(1) } },
    { expiry: { freshMs: 1000 } },
    { expiry: { freshMs: 0, staleMs: TimeUnit.DAYS.toMillis(30) } },
  ])('Accepts the expiry $expiry', ({ expiry }) => {
    expect(() => validateCacheDefinition({ ...createDefinition('anidb.anime-xml', 1), expiry })).not.toThrow();
  });

  test.for([
    { expiry: { freshMs: 0 } },
    { expiry: { freshMs: 999 } },
    { expiry: { freshMs: -TimeUnit.DAYS.toMillis(1), staleMs: TimeUnit.DAYS.toMillis(2) } },
    { expiry: { freshMs: TimeUnit.DAYS.toMillis(1), staleMs: -1000 } },
  ])('Rejects the expiry $expiry, which keeps entries for less than a second', ({ expiry }) => {
    expect(() => validateCacheDefinition({ ...createDefinition('anidb.anime-xml', 1), expiry })).toThrow(`Invalid cache expiry ${JSON.stringify(expiry)} for the cache namespace 'anidb.anime-xml'`);
  });

  test('Rejects an expiry for nulls that keeps them for less than a second', () => {
    const definition = { ...createDefinition('anidb.anime-xml', 1), nullExpiry: { freshMs: 0 } };

    expect(() => validateCacheDefinition(definition)).toThrow('Invalid cache expiry {"freshMs":0} for the nulls of cache namespace \'anidb.anime-xml\'');
  });
});
