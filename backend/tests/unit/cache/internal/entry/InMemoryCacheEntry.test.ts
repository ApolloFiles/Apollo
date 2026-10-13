import { InMemoryCacheEntry } from '#src/cache/internal/entry/InMemoryCacheEntry.js';

describe(InMemoryCacheEntry, () => {
  test('Rejects instead of throwing when its payload cannot be decoded', async () => {
    const entry = new InMemoryCacheEntry(Buffer.from('{"title":'), () => {
      throw new SyntaxError('Unexpected end of JSON input');
    }, false, new Date('2026-10-01T08:00:00Z'), null, 'application/json');

    const value = entry.value();

    await expect(value).rejects.toThrow(SyntaxError);
  });
});
