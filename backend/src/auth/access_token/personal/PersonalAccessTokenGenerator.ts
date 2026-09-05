import { singleton } from 'tsyringe';
import SecureTokenHelper from '../../SecureTokenHelper.js';

export type GeneratedPersonalAccessToken = {
  fullToken: string;
  tokenHint: string;
  tokenHash: Buffer<ArrayBuffer>;
};

@singleton()
export default class PersonalAccessTokenGenerator {
  private static readonly PREFIX = 'apollo_pat_';
  private static readonly HINT_VISIBLE_CHARS = 4;

  constructor(
    private readonly secureTokenHelper: SecureTokenHelper,
  ) {
  }

  generate(): GeneratedPersonalAccessToken {
    const token = this.secureTokenHelper.create();
    const fullToken = PersonalAccessTokenGenerator.PREFIX + token.value;

    return {
      fullToken: fullToken,
      tokenHint: this.createTokenHint(fullToken),
      tokenHash: this.secureTokenHelper.hashToken(fullToken),
    };
  }

  private createTokenHint(token: string): string {
    return PersonalAccessTokenGenerator.PREFIX + '…' + token.slice(-PersonalAccessTokenGenerator.HINT_VISIBLE_CHARS);
  }
}
