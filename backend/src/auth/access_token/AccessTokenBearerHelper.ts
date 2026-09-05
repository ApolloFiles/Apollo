import { singleton } from 'tsyringe';
import PersonalAccessTokenGenerator from './personal/PersonalAccessTokenGenerator.js';
import UserByAccessTokenProvider, { type AccessTokenUser } from './UserByAccessTokenProvider.js';

@singleton()
export default class AccessTokenBearerHelper {
  private static readonly AUTHORIZATION_SCHEME = 'bearer ';

  constructor(
    private readonly personalAccessTokenGenerator: PersonalAccessTokenGenerator,
    private readonly userByAccessTokenProvider: UserByAccessTokenProvider,
  ) {
  }

  extractBearerToken(authorizationHeader: string): string | null {
    const scheme = AccessTokenBearerHelper.AUTHORIZATION_SCHEME;
    if (authorizationHeader.slice(0, scheme.length).toLowerCase() !== scheme) {
      return null;
    }
    return authorizationHeader.slice(scheme.length);
  }

  async findUserByBearerToken(token: string): Promise<AccessTokenUser | null> {
    if (!this.personalAccessTokenGenerator.isValidTokenFormat(token)) {
      return null;
    }
    return this.userByAccessTokenProvider.findByAccessTokenAndUpdateLastActivity(token);
  }
}
