import Crypto from 'node:crypto';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import PersonalAccessTokenGenerator from '../../../../../src/auth/access_token/personal/PersonalAccessTokenGenerator.js';
import SecureRandomBase62Generator from '../../../../../src/auth/SecureRandomBase62Generator.js';
import SecureTokenHelper from '../../../../../src/auth/SecureTokenHelper.js';

const PREFIX = 'apollo_pat_';
const EXPECTED_TOKEN_LENGTH = 43;

function createGeneratorWithFixedToken(tokenValue: string): { generator: PersonalAccessTokenGenerator, secureTokenHelper: SecureTokenHelper } {
  const generate = vi.fn().mockReturnValue(tokenValue);
  const secureTokenHelper = new SecureTokenHelper({ generate } as unknown as SecureRandomBase62Generator);

  return {
    generator: new PersonalAccessTokenGenerator(secureTokenHelper),
    secureTokenHelper,
  };
}

function createGeneratorWithRealRandomness(): PersonalAccessTokenGenerator {
  return new PersonalAccessTokenGenerator(new SecureTokenHelper(new SecureRandomBase62Generator()));
}

describe('PersonalAccessTokenGenerator#generate', () => {
  test('Prefixes the token from the SecureTokenHelper', () => {
    const { generator } = createGeneratorWithFixedToken('someGeneratedToken');

    expect(generator.generate().fullToken).toBe(`${PREFIX}someGeneratedToken`);
  });

  test('Hashes the full token including the prefix, not the raw token', () => {
    const { generator, secureTokenHelper } = createGeneratorWithFixedToken('someGeneratedToken');

    const token = generator.generate();

    expect(token.tokenHash).toEqual(secureTokenHelper.hashToken(`${PREFIX}someGeneratedToken`));
    expect(token.tokenHash).not.toEqual(secureTokenHelper.hashToken('someGeneratedToken'));
  });

  test('Returns the sha256sum of the full token as a 32 byte buffer', () => {
    const { generator } = createGeneratorWithFixedToken('someGeneratedToken');

    const token = generator.generate();

    expect(token.tokenHash).toHaveLength(32);
    expect(token.tokenHash).toEqual(Crypto.createHash('sha256').update(token.fullToken, 'utf-8').digest());
  });

  test('Builds the hint from the prefix and the last four characters of the full token', () => {
    const { generator } = createGeneratorWithFixedToken('someGeneratedToken');

    expect(generator.generate().tokenHint).toBe(`${PREFIX}…oken`);
  });

  test('Never reveals more than four characters of the secret through the hint', () => {
    const generator = createGeneratorWithRealRandomness();

    const token = generator.generate();
    const secret = token.fullToken.slice(PREFIX.length);

    expect(token.tokenHint).toHaveLength(PREFIX.length + 1 + 4);
    expect(token.tokenHint).not.toContain(secret);
    expect(secret).toContain(token.tokenHint.slice(-4));
  });

  test('Never stores the plaintext token inside the hash', () => {
    const generator = createGeneratorWithRealRandomness();

    const token = generator.generate();

    expect(token.tokenHash.toString('latin1')).not.toContain(token.fullToken);
  });

  describe('with real randomness', () => {
    let generator: PersonalAccessTokenGenerator;

    beforeEach(() => {
      generator = createGeneratorWithRealRandomness();
    });

    test('Produces a prefixed base62 token of the expected length', () => {
      const fullToken = generator.generate().fullToken;

      expect(fullToken).toHaveLength(PREFIX.length + EXPECTED_TOKEN_LENGTH);
      expect(fullToken).toMatch(new RegExp(`^${PREFIX}[A-Za-z0-9]{${EXPECTED_TOKEN_LENGTH}}$`));
    });

    test('Produces a different token on every call', () => {
      const fullTokens = new Set<string>();
      const hashes = new Set<string>();

      for (let i = 0; i < 1000; ++i) {
        const token = generator.generate();
        fullTokens.add(token.fullToken);
        hashes.add(token.tokenHash.toString('hex'));
      }

      expect(fullTokens.size).toBe(1000);
      expect(hashes.size).toBe(1000);
    });
  });
});
