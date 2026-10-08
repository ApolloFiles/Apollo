import type { DeepMockProxy } from 'vitest-mock-extended';
import SecureRandomBase62Generator from '#src/auth/SecureRandomBase62Generator.js';
import SecureTokenHelper from '#src/auth/SecureTokenHelper.js';
import { createStrictDeepMock } from '#tests/test-helpers.js';

describe(SecureTokenHelper, () => {
  let randomGenerator: DeepMockProxy<SecureRandomBase62Generator>;
  let helper: SecureTokenHelper;

  beforeEach(() => {
    randomGenerator = createStrictDeepMock<SecureRandomBase62Generator>();
    randomGenerator.generate.mockReturnValue('someGeneratedToken');
    helper = new SecureTokenHelper(randomGenerator);
  });

  describe('create', () => {
    test('Asks the generator for a token of 43 base62 characters (about 256 bits of entropy)', () => {
      helper.create();

      expect(randomGenerator.generate).toHaveBeenCalledExactlyOnceWith(43);
    });

    test('Returns the generated token untouched', () => {
      expect(helper.create().value).toBe('someGeneratedToken');
    });

    test('Returns the sha256sum of the token it returns', () => {
      const token = helper.create();

      expect(token.sha256sum.toString('hex')).toBe('07066bd423850d4aace2dd3a77185b76db53ea2fcfc40c67ca0d3e90f150a013');
    });

    test('Never stores the plaintext token inside the hash', () => {
      const token = helper.create();

      expect(token.sha256sum).toHaveLength(32);
      expect(token.sha256sum.toString('latin1')).not.toContain('someGeneratedToken');
    });

    describe('with the real generator', () => {
      beforeEach(() => {
        helper = new SecureTokenHelper(new SecureRandomBase62Generator());
      });

      test('Produces a base62 token of 43 characters', () => {
        const token = helper.create();

        expect(token.value).toMatch(/^[A-Za-z0-9]{43}$/);
      });

      test('Produces a different token on every call', () => {
        const tokens = Array.from({ length: 1000 }, () => helper.create());

        expect(new Set(tokens.map((token) => token.value)).size).toBe(1000);
        expect(new Set(tokens.map((token) => token.sha256sum.toString('hex'))).size).toBe(1000);
      });
    });
  });

  describe('hashToken', () => {
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

    test('Returns a different hash for a token that differs only in case', () => {
      expect(helper.hashToken('someToken')).not.toEqual(helper.hashToken('sometoken'));
    });

    test('Hashes the utf-8 bytes of the token', () => {
      expect(helper.hashToken('süß🔑').toString('hex')).toBe('6e149cc6bb12211e6c22d4700ffdd484c2a0651e77ba44602c4ba1adfe9e8f30');
    });

    test('Hashes an empty token instead of rejecting it', () => {
      expect(helper.hashToken('').toString('hex')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    });
  });
});
