import { singleton } from 'tsyringe';
import DatabaseClient from '../../database/DatabaseClient.js';
import SecureTokenHelper from '../SecureTokenHelper.js';

@singleton()
export default class AccountCreationInviteCreator {
  private readonly TWO_DAYS_IN_MILLIS = 2 * 24 * 60 * 60 * 1000;
  private readonly TEN_MINUTES_IN_MILLIS = 10 * 60 * 1000;

  constructor(
    private readonly databaseClient: DatabaseClient,
    private readonly secureTokenHelper: SecureTokenHelper,
  ) {
  }

  async create(): Promise<string> {
    const inviteToken = this.secureTokenHelper.create();

    const expiresAt = await this.databaseClient.fetchNow();
    expiresAt.setTime(expiresAt.getTime() + this.TWO_DAYS_IN_MILLIS);

    await this.databaseClient.authAccountCreationInviteToken.create({
      data: {
        hashedToken: inviteToken.sha256sum,
        expiresAt,
      },
    });

    return inviteToken.value;
  }

  async createForSuperUserAccount(): Promise<string> {
    const inviteToken = this.secureTokenHelper.create();

    const expiresAt = await this.databaseClient.fetchNow();
    expiresAt.setTime(expiresAt.getTime() + this.TEN_MINUTES_IN_MILLIS);

    await this.databaseClient.authAccountCreationInviteToken.create({
      data: {
        hashedToken: inviteToken.sha256sum,
        expiresAt,
        createSuperUserAccount: true,
      },
    });

    return inviteToken.value;
  }
}
