import Crypto from 'node:crypto';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import SecureRandomBase62Generator from '../../../src/auth/SecureRandomBase62Generator.js';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const LOWEST_BIASED_BYTE_VALUE = 248;

function mockRandomBytes(...batches: number[][]): void {
  const randomBytes = vi.spyOn(Crypto, 'randomBytes') as unknown as ReturnType<typeof vi.fn>;
  for (const batch of batches) {
    randomBytes.mockReturnValueOnce(Buffer.from(batch));
  }
}

describe('SecureRandomBase62Generator#generate', () => {
  let generator: SecureRandomBase62Generator;

  beforeEach(() => {
    generator = new SecureRandomBase62Generator();
  });

  test('Returns a string of the requested length', () => {
    for (const length of [1, 2, 3, 20, 36, 64, 1000]) {
      expect(generator.generate(length)).toHaveLength(length);
    }
  });

  test('Returns an empty string for a length of zero', () => {
    expect(generator.generate(0)).toBe('');
  });

  test('Only ever uses characters from the base62 alphabet', () => {
    for (let i = 0; i < 100; ++i) {
      expect(generator.generate(256)).toMatch(/^[A-Za-z0-9]+$/);
    }
  });

  test('Does not repeat itself across calls', () => {
    const generated = new Set<string>();
    for (let i = 0; i < 1000; ++i) {
      generated.add(generator.generate(36));
    }
    expect(generated.size).toBe(1000);
  });

  test('Can produce every character of the alphabet', () => {
    const seenChars = new Set<string>();
    for (let i = 0; i < 100; ++i) {
      for (const char of generator.generate(256)) {
        seenChars.add(char);
      }
    }
    expect(Array.from(seenChars).sort().join('')).toBe(Array.from(ALPHABET).sort().join(''));
  });

  test('Maps a byte to the alphabet by its remainder', () => {
    mockRandomBytes([0, 1, 61, 62, 63]);
    expect(generator.generate(5)).toBe('AB9AB');
  });

  test('Rejects the byte values that would bias the distribution', () => {
    const biasedBytes = [248, 249, 250, 251, 252, 253, 254, 255];
    expect(biasedBytes[0]).toBe(LOWEST_BIASED_BYTE_VALUE);

    mockRandomBytes([...biasedBytes, LOWEST_BIASED_BYTE_VALUE - 1], [0]);
    expect(generator.generate(1)).toBe(ALPHABET[(LOWEST_BIASED_BYTE_VALUE - 1) % ALPHABET.length]);
  });

  test('Draws again when a batch got rejected entirely', () => {
    mockRandomBytes([255, 255], [254, 253], [5, 6]);
    expect(generator.generate(2)).toBe(`${ALPHABET[5]}${ALPHABET[6]}`);
    expect(Crypto.randomBytes).toHaveBeenCalledTimes(3);
  });

  test('Only asks for the bytes still missing after a partial rejection', () => {
    mockRandomBytes([0, 250, 250, 1], [2, 3]);
    expect(generator.generate(4)).toBe(`${ALPHABET[0]}${ALPHABET[1]}${ALPHABET[2]}${ALPHABET[3]}`);
    expect(Crypto.randomBytes).toHaveBeenNthCalledWith(1, 4);
    expect(Crypto.randomBytes).toHaveBeenNthCalledWith(2, 2);
  });

  test.each([-1, 1.5, NaN, Infinity])('Throws for an invalid length (%s)', (length) => {
    expect(() => generator.generate(length)).toThrow(/non-negative integer/);
  });
});
