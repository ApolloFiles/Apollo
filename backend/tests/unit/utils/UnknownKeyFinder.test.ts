import { z } from 'zod';
import { UnknownKeyFinder } from '#src/utils/UnknownKeyFinder.js';

function findUnknownKeys(schema: z.ZodType, raw: unknown): string[] {
  return UnknownKeyFinder.find(raw, schema.parse(raw));
}

describe(UnknownKeyFinder, () => {
  test('Finds nothing when the schema declares every key', () => {
    const schema = z.object({ id: z.number(), title: z.string() });

    expect(findUnknownKeys(schema, { id: 550, title: 'Fight Club' })).toEqual([]);
  });

  test('Finds an undeclared top-level key', () => {
    const schema = z.object({ id: z.number() });

    expect(findUnknownKeys(schema, { id: 550, softcore: false })).toEqual(['softcore']);
  });

  test('Joins the path to an undeclared nested key with dots', () => {
    const schema = z.object({ images: z.object({ secure_base_url: z.string() }) });

    expect(findUnknownKeys(schema, { images: { secure_base_url: 'https://image.tmdb.org/t/p/', base_url: 'http://image.tmdb.org/t/p/' } }))
      .toEqual(['images.base_url']);
  });

  test('Reports an undeclared key of array elements once', () => {
    const schema = z.object({ posters: z.array(z.object({ file_path: z.string() })) });

    expect(findUnknownKeys(schema, {
      posters: [
        { file_path: '/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg', width: 2000 },
        { file_path: '/r3pPehX4ik8NLYPpbDRAh0YRtMb.jpg', width: 1000 },
      ],
    })).toEqual(['posters[].width']);
  });

  test('Reports an undeclared object without listing its keys', () => {
    const schema = z.object({ id: z.number() });

    expect(findUnknownKeys(schema, { id: 550, belongs_to_collection: { id: 10, name: 'Some Collection' } }))
      .toEqual(['belongs_to_collection']);
  });

  test('Does not look into values the schema accepts as unknown', () => {
    const schema = z.object({ person_results: z.array(z.unknown()) });

    expect(findUnknownKeys(schema, { person_results: [{ id: 819, name: 'Edward Norton' }] })).toEqual([]);
  });

  test('Does not look into records', () => {
    const schema = z.object({ ratings: z.record(z.string(), z.number()) });

    expect(findUnknownKeys(schema, { ratings: { DE: 16, US: 18 } })).toEqual([]);
  });

  test('Does not report a key whose value is null', () => {
    const schema = z.object({ backdrop_path: z.string().nullable() });

    expect(findUnknownKeys(schema, { backdrop_path: null })).toEqual([]);
  });
});
