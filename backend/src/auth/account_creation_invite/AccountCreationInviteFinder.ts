import { singleton } from 'tsyringe';
import DatabaseClient from '../../database/DatabaseClient.js';
import SecureTokenHelper from '../SecureTokenHelper.js';

export type InviteToken = {
  hashedToken: string,
  createdAt: Date,
  expiresAt: Date,
  createSuperUserAccount: boolean,
}

@singleton()
export default class AccountCreationInviteFinder {
  constructor(
    private readonly databaseClient: DatabaseClient,
    private readonly secureTokenHelper: SecureTokenHelper,
  ) {
  }

  async findByToken(token: string): Promise<InviteToken | null> {
    const inviteToken = await this.databaseClient.authAccountCreationInviteToken.findUnique({
      where: {
        hashedToken: this.secureTokenHelper.hashToken(token),
        expiresAt: { gt: await this.databaseClient.fetchNow() },
      },
      select: {
        hashedToken: true,
        createdAt: true,
        expiresAt: true,
        createSuperUserAccount: true,
      },
    });

    if (inviteToken == null) {
      return null;
    }

    return {
      hashedToken: this.secureTokenHelper.stringifyHashedToken(inviteToken.hashedToken),
      createdAt: inviteToken.createdAt,
      expiresAt: inviteToken.expiresAt,
      createSuperUserAccount: inviteToken.createSuperUserAccount,
    };
  }
}
