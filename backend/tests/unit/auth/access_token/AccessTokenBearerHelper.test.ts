import type { DeepMockProxy } from 'vitest-mock-extended';
import { describe, expect, test } from 'vitest';
import AccessTokenBearerHelper from '../../../../src/auth/access_token/AccessTokenBearerHelper.js';
import PersonalAccessTokenGenerator from '../../../../src/auth/access_token/personal/PersonalAccessTokenGenerator.js';
import type UserByAccessTokenProvider from '../../../../src/auth/access_token/UserByAccessTokenProvider.js';
import SecureRandomBase62Generator from '../../../../src/auth/SecureRandomBase62Generator.js';
import SecureTokenHelper from '../../../../src/auth/SecureTokenHelper.js';
import { createStrictDeepMock } from '../../../test-helpers.js';

function createHelper(): { helper: AccessTokenBearerHelper, provider: DeepMockProxy<UserByAccessTokenProvider>, validToken: string } {
  const generator = new PersonalAccessTokenGenerator(new SecureTokenHelper(new SecureRandomBase62Generator()));
  const provider = createStrictDeepMock<UserByAccessTokenProvider>();
  provider.findByAccessTokenAndUpdateLastActivity.mockResolvedValue(null);

  return {
    helper: new AccessTokenBearerHelper(generator, provider),
    provider,
    validToken: generator.generate().fullToken,
  };
}

describe('AccessTokenBearerHelper#extractBearerToken', () => {
  test.each([
    ['the canonical spelling', 'Bearer someToken'],
    ['an all lower-case scheme', 'bearer someToken'],
    ['an all upper-case scheme', 'BEARER someToken'],
  ])('Extracts the token from %s', (_description, header) => {
    const { helper } = createHelper();

    expect(helper.extractBearerToken(header)).toBe('someToken');
  });

  test.each([
    ['an empty header', ''],
    ['a Basic header', 'Basic someToken'],
    ['the scheme without a space', 'BearersomeToken'],
    ['a scheme that merely starts with bearer', 'Bearerish someToken'],
  ])('Returns null for %s', (_description, header) => {
    const { helper } = createHelper();

    expect(helper.extractBearerToken(header)).toBeNull();
  });
});

describe('AccessTokenBearerHelper#findUserByBearerToken', () => {
  test('Rejects a malformed token without hitting the database', async () => {
    const { helper, provider } = createHelper();

    await expect(helper.findUserByBearerToken('not-a-token')).resolves.toBeNull();
    expect(provider.findByAccessTokenAndUpdateLastActivity).not.toHaveBeenCalled();
  });

  test('Passes a well-formed token on to the provider', async () => {
    const { helper, provider, validToken } = createHelper();

    await helper.findUserByBearerToken(validToken);

    expect(provider.findByAccessTokenAndUpdateLastActivity).toHaveBeenCalledExactlyOnceWith(validToken);
  });
});
