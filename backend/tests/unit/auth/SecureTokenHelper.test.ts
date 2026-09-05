import Crypto from 'node:crypto';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import SecureRandomBase62Generator from '../../../src/auth/SecureRandomBase62Generator.js';
import SecureTokenHelper from '../../../src/auth/SecureTokenHelper.js';

const EXPECTED_TOKEN_LENGTH = 43;
const EMPTY_STRING_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

function createHelperWithFakeGenerator(...tokens: string[]): { helper: SecureTokenHelper, generate: ReturnType<typeof vi.fn> } {
  const generate = vi.fn();
  for (const token of tokens) {
    generate.mockReturnValueOnce(token);
  }

  return {
    helper: new SecureTokenHelper({ generate } as unknown as SecureRandomBase62Generator),
    generate,
  };
}

describe('SecureTokenHelper#create', () => {
  test('Asks the generator for a token of 43 base62 characters (about 256 bits of entropy)', () => {
    const { helper, generate } = createHelperWithFakeGenerator('a'.repeat(EXPECTED_TOKEN_LENGTH));

    helper.create();

    expect(generate).toHaveBeenCalledExactlyOnceWith(EXPECTED_TOKEN_LENGTH);
  });

  test('Returns the generated token untouched', () => {
    const { helper } = createHelperWithFakeGenerator('someGeneratedToken');

    expect(helper.create().value).toBe('someGeneratedToken');
  });

  test('Returns the sha256sum of the token it returns', () => {
    const { helper } = createHelperWithFakeGenerator('someGeneratedToken');

    const token = helper.create();

    expect(token.sha256sum).toEqual(Crypto.createHash('sha256').update('someGeneratedToken', 'utf-8').digest());
    expect(token.sha256sum).toEqual(helper.hashToken(token.value));
  });

  test('Never stores the plaintext token inside the hash', () => {
    const { helper } = createHelperWithFakeGenerator('someGeneratedToken');

    const token = helper.create();

    expect(token.sha256sum).toHaveLength(32);
    expect(token.sha256sum.toString('latin1')).not.toContain(token.value);
  });

  describe('with the real generator', () => {
    let helper: SecureTokenHelper;

    beforeEach(() => {
      helper = new SecureTokenHelper(new SecureRandomBase62Generator());
    });

    test('Produces a base62 token of the expected length', () => {
      const token = helper.create();

      expect(token.value).toHaveLength(EXPECTED_TOKEN_LENGTH);
      expect(token.value).toMatch(/^[A-Za-z0-9]+$/);
    });

    test('Produces a different token on every call', () => {
      const values = new Set<string>();
      const hashes = new Set<string>();

      for (let i = 0; i < 1000; ++i) {
        const token = helper.create();
        values.add(token.value);
        hashes.add(token.sha256sum.toString('hex'));
      }

      expect(values.size).toBe(1000);
      expect(hashes.size).toBe(1000);
    });
  });
});

describe('SecureTokenHelper#hashToken', () => {
  let helper: SecureTokenHelper;

  beforeEach(() => {
    helper = createHelperWithFakeGenerator().helper;
  });

  test('Returns the sha256sum as a 32 byte buffer', () => {
    const hash = helper.hashToken('someToken');

    expect(Buffer.isBuffer(hash)).toBe(true);
    expect(hash).toHaveLength(32);
  });

  test('Returns the same hash for the same token', () => {
    expect(helper.hashToken('someToken')).toEqual(helper.hashToken('someToken'));
  });

  test('Returns a different hash for a different token', () => {
    expect(helper.hashToken('someToken')).not.toEqual(helper.hashToken('someTokeo'));
  });

  test('Is case-sensitive', () => {
    expect(helper.hashToken('someToken')).not.toEqual(helper.hashToken('sometoken'));
  });

  test('Hashes the utf-8 bytes of the token', () => {
    expect(helper.hashToken('süß🔑').toString('hex'))
      .toBe(Crypto.createHash('sha256').update(Buffer.from('süß🔑', 'utf-8')).digest('hex'));
  });

  test('Hashes an empty token instead of rejecting it', () => {
    expect(helper.hashToken('').toString('hex')).toBe(EMPTY_STRING_SHA256);
  });
});
