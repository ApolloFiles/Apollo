import { CacheCodecs } from '#src/cache/CacheCodec.js';
import { z } from 'zod';

describe('CacheCodecs.json', () => {
  const animeSchema = z.object({
    id: z.number(),
    title: z.string(),
    episodes: z.array(z.object({ number: z.number(), airedAt: z.string().nullable() })),
    rating: z.number().optional(),
  });

  test('Decodes what it encoded', () => {
    const codec = CacheCodecs.json(animeSchema);
    const anime = { id: 17, title: 'Cowboy Bebop', episodes: [{ number: 1, airedAt: '1998-10-24' }] };

    expect(codec.decode(codec.encode(anime))).toEqual(anime);
  });

  test('Rejects data that does not match the schema', () => {
    const codec = CacheCodecs.json(animeSchema);

    expect(() => codec.decode(Buffer.from('{"id":17,"titel":"Cowboy Bebop","episodes":[]}'))).toThrow(z.ZodError);
  });

  test('Does not compile for schemas whose values JSON cannot carry unchanged', () => {
    // @ts-expect-error A Date comes back from JSON as a string
    CacheCodecs.json(z.object({ fetchedAt: z.date() }));
    // @ts-expect-error The stored output would be validated as input
    CacheCodecs.json(z.object({ episodeCount: z.string().transform((count) => Number.parseInt(count, 10)) }));
    // @ts-expect-error A Map comes back from JSON as {}
    CacheCodecs.json(z.map(z.string(), z.number()));
    // @ts-expect-error A bigint cannot be stringified
    CacheCodecs.json(z.bigint());
  });
});
