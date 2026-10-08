import type { DeepMockProxy } from 'vitest-mock-extended';
import PersonalAccessTokenGenerator from '#src/auth/access_token/personal/PersonalAccessTokenGenerator.js';
import SecureRandomBase62Generator from '#src/auth/SecureRandomBase62Generator.js';
import SecureTokenHelper from '#src/auth/SecureTokenHelper.js';
import { createStrictDeepMock } from '#tests/test-helpers.js';

const VALID_BODY = 'a'.repeat(43);

describe(PersonalAccessTokenGenerator, () => {
  let randomGenerator: DeepMockProxy<SecureRandomBase62Generator>;
  let generator: PersonalAccessTokenGenerator;

  beforeEach(() => {
    randomGenerator = createStrictDeepMock<SecureRandomBase62Generator>();
    randomGenerator.generate.mockReturnValue('someGeneratedToken');
    generator = new PersonalAccessTokenGenerator(new SecureTokenHelper(randomGenerator));
  });

  describe('isValidTokenFormat', () => {
    test('Accepts a prefixed token with 43 base62 characters', () => {
      expect(generator.isValidTokenFormat('apollo_pat_Q7mZr2XkV9pLb4TnW8sYc1HdF6gJaE3uK0oRiN5vMxB')).toBe(true);
    });

    test.for([
      { description: 'a missing prefix', token: VALID_BODY },
      { description: 'a different prefix', token: `apollo_sat_${VALID_BODY}` },
      { description: 'a prefix that is not separated by an underscore', token: `apollo_pat${VALID_BODY}` },
      { description: 'a body that is one character too short', token: `apollo_pat_${'a'.repeat(42)}` },
      { description: 'a body that is one character too long', token: `apollo_pat_${'a'.repeat(44)}` },
      { description: 'a non-base62 character in the body', token: `apollo_pat_${'a'.repeat(42)}-` },
      { description: 'leading whitespace', token: ` apollo_pat_${VALID_BODY}` },
      { description: 'trailing whitespace', token: `apollo_pat_${VALID_BODY} ` },
      { description: 'a trailing newline', token: `apollo_pat_${VALID_BODY}\n` },
      { description: 'an empty string', token: '' },
    ])('Rejects a token with $description', ({ token }) => {
      expect(generator.isValidTokenFormat(token)).toBe(false);
    });
  });

  describe('generate', () => {
    test('Prefixes the generated secret', () => {
      expect(generator.generate().fullToken).toBe('apollo_pat_someGeneratedToken');
    });

    test('Hashes the full token including the prefix into a sha256sum', () => {
      const token = generator.generate();

      expect(token.tokenHash.toString('hex')).toBe('68c57186730a7cc993e3fb47225eb65c964848974705dc9f67c9e254ea94b306');
    });

    test('Builds the hint from the prefix and the last four characters of the full token', () => {
      expect(generator.generate().tokenHint).toBe('apollo_pat_…oken');
    });

    test('Never stores the plaintext token inside the hash', () => {
      const token = generator.generate();

      expect(token.tokenHash.toString('latin1')).not.toContain('apollo_pat_someGeneratedToken');
    });

    describe('with real randomness', () => {
      beforeEach(() => {
        generator = new PersonalAccessTokenGenerator(new SecureTokenHelper(new SecureRandomBase62Generator()));
      });

      test('Produces a prefixed base62 token with 43 characters after the prefix', () => {
        expect(generator.generate().fullToken).toMatch(/^apollo_pat_[A-Za-z0-9]{43}$/);
      });

      test('Produces a token in the format it accepts', () => {
        const token = generator.generate();

        expect(generator.isValidTokenFormat(token.fullToken)).toBe(true);
      });

      test('Never reveals more than four characters of the secret through the hint', () => {
        const token = generator.generate();

        expect(token.tokenHint).toHaveLength(16);
        expect(token.tokenHint.slice(0, 12)).toBe('apollo_pat_…');
        expect(token.fullToken.endsWith(token.tokenHint.slice(-4))).toBe(true);
      });

      test('Produces a different token on every call', () => {
        const tokens = Array.from({ length: 1000 }, () => generator.generate());

        expect(new Set(tokens.map((token) => token.fullToken)).size).toBe(1000);
        expect(new Set(tokens.map((token) => token.tokenHash.toString('hex'))).size).toBe(1000);
      });
    });
  });
});
