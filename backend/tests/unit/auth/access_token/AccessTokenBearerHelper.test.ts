import type { DeepMockProxy } from 'vitest-mock-extended';
import AccessTokenBearerHelper from '#src/auth/access_token/AccessTokenBearerHelper.js';
import PersonalAccessTokenGenerator from '#src/auth/access_token/personal/PersonalAccessTokenGenerator.js';
import type { default as UserByAccessTokenProvider, AccessTokenUser } from '#src/auth/access_token/UserByAccessTokenProvider.js';
import type SecureTokenHelper from '#src/auth/SecureTokenHelper.js';
import { createStrictDeepMock } from '#tests/test-helpers.js';

const WELL_FORMED_TOKEN = 'apollo_pat_Q7mZr2XkV9pLb4TnW8sYc1HdF6gJaE3uK0oRiN5vMxB';
const TOKEN_USER = { user: { id: 'token-user' }, accessToken: {} } as unknown as AccessTokenUser;

describe(AccessTokenBearerHelper, () => {
  let provider: DeepMockProxy<UserByAccessTokenProvider>;
  let helper: AccessTokenBearerHelper;

  beforeEach(() => {
    provider = createStrictDeepMock<UserByAccessTokenProvider>();
    provider.findByAccessTokenAndUpdateLastActivity.mockResolvedValue(TOKEN_USER);
    helper = new AccessTokenBearerHelper(new PersonalAccessTokenGenerator(createStrictDeepMock<SecureTokenHelper>()), provider);
  });

  describe('extractBearerToken', () => {
    test.for([
      { description: 'the canonical spelling', header: 'Bearer someToken' },
      { description: 'an all lower-case scheme', header: 'bearer someToken' },
      { description: 'an all upper-case scheme', header: 'BEARER someToken' },
    ])('Extracts the token from $description', ({ header }) => {
      expect(helper.extractBearerToken(header)).toBe('someToken');
    });

    test.for([
      { description: 'an empty header', header: '' },
      { description: 'a Basic header', header: 'Basic someToken' },
      { description: 'the scheme without a space', header: 'BearersomeToken' },
      { description: 'a scheme that merely starts with bearer', header: 'Bearerish someToken' },
    ])('Returns null for $description', ({ header }) => {
      expect(helper.extractBearerToken(header)).toBeNull();
    });
  });

  describe('findUserByBearerToken', () => {
    test('Returns null for a malformed token without looking it up', async () => {
      await expect(helper.findUserByBearerToken('not-a-token')).resolves.toBeNull();

      expect(provider.findByAccessTokenAndUpdateLastActivity).not.toHaveBeenCalled();
    });

    test('Returns the user the provider finds for a well-formed token', async () => {
      await expect(helper.findUserByBearerToken(WELL_FORMED_TOKEN)).resolves.toBe(TOKEN_USER);
    });

    test('Records the activity of a well-formed token', async () => {
      await helper.findUserByBearerToken(WELL_FORMED_TOKEN);

      expect(provider.findByAccessTokenAndUpdateLastActivity).toHaveBeenCalledExactlyOnceWith(WELL_FORMED_TOKEN);
    });
  });
});
