import Crypto from 'node:crypto';
import SecureRandomBase62Generator from '#src/auth/SecureRandomBase62Generator.js';

function mockRandomBytes(...batches: number[][]): void {
  const randomBytes = vi.spyOn(Crypto, 'randomBytes') as unknown as ReturnType<typeof vi.fn>;
  for (const batch of batches) {
    randomBytes.mockReturnValueOnce(Buffer.from(batch));
  }
}

describe(SecureRandomBase62Generator, () => {
  let generator: SecureRandomBase62Generator;

  beforeEach(() => {
    generator = new SecureRandomBase62Generator();
  });

  test.for([
    { length: 1 },
    { length: 2 },
    { length: 3 },
    { length: 20 },
    { length: 36 },
    { length: 64 },
    { length: 1000 },
  ])('Returns a string of $length characters when asked for $length', ({ length }) => {
    expect(generator.generate(length)).toHaveLength(length);
  });

  test('Returns an empty string for a length of zero', () => {
    expect(generator.generate(0)).toBe('');
  });

  test('Only ever uses characters from the base62 alphabet', () => {
    expect(generator.generate(25_600)).toMatch(/^[A-Za-z0-9]+$/);
  });

  test('Does not repeat itself across calls', () => {
    const generated = Array.from({ length: 1000 }, () => generator.generate(36));

    expect(new Set(generated).size).toBe(1000);
  });

  test('Can produce every character of the alphabet', () => {
    const seenChars = new Set(generator.generate(25_600));

    expect(Array.from(seenChars).sort().join('')).toBe('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz');
  });

  test('Maps a byte to the alphabet by its remainder', () => {
    mockRandomBytes([0, 1, 61, 62, 63]);

    expect(generator.generate(5)).toBe('AB9AB');
  });

  test('Rejects the byte values 248 to 255, which would bias the distribution', () => {
    mockRandomBytes([248, 249, 250, 251, 252, 253, 254, 255, 247], [0]);

    expect(generator.generate(1)).toBe('9');
  });

  test('Draws again when a batch got rejected entirely', () => {
    mockRandomBytes([255, 255], [254, 253], [5, 6]);

    expect(generator.generate(2)).toBe('FG');
  });

  test('Only asks for the bytes still missing after a partial rejection', () => {
    mockRandomBytes([0, 250, 250, 1], [2, 3]);

    const generated = generator.generate(4);

    expect(generated).toBe('ABCD');
    expect(Crypto.randomBytes).toHaveBeenNthCalledWith(1, 4);
    expect(Crypto.randomBytes).toHaveBeenNthCalledWith(2, 2);
  });

  test.for([
    { length: -1 },
    { length: 1.5 },
    { length: NaN },
    { length: Infinity },
  ])('Throws for the invalid length $length', ({ length }) => {
    expect(() => generator.generate(length)).toThrow(new Error(`Expected 'length' to be a non-negative integer but got ${length}`));
  });
});
