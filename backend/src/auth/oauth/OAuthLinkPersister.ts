import { singleton } from 'tsyringe';
import DatabaseClient from '../../database/DatabaseClient.js';
import UploadedProfilePicturePreProcessor from '../../user/picture/UploadedProfilePicturePreProcessor.js';

@singleton()
export default class OAuthLinkPersister {
  constructor(
    private readonly databaseClient: DatabaseClient,
    private readonly profilePicturePreProcessor: UploadedProfilePicturePreProcessor,
  ) {
  }

  async createLink(providerId: string, apolloUserId: string, providerUserId: string, displayName: string, rawProfilePictureBytes: Buffer | null): Promise<void> {
    const profilePictureBytes = await this.preProcessProfilePicture(rawProfilePictureBytes);

    await this.databaseClient.authUserLinkedProvider.create({
      data: {
        providerId,
        userId: apolloUserId,
        providerUserId,
        providerUserDisplayName: displayName,
        providerUserProfilePicture: profilePictureBytes,
      },

      select: { providerId: true },
    });
  }

  async updateLinkData(providerId: string, apolloUserId: string, displayName: string, rawProfilePictureBytes: Buffer | null): Promise<void> {
    const profilePictureBytes = await this.preProcessProfilePicture(rawProfilePictureBytes);

    await this.databaseClient.authUserLinkedProvider.update({
      where: {
        userId_providerId: {
          userId: apolloUserId,
          providerId,
        },
      },
      data: {
        providerUserDisplayName: displayName,
        providerUserProfilePicture: profilePictureBytes,
      },

      select: { providerId: true },
    });
  }

  async unlinkProvider(providerId: string, apolloUserId: string): Promise<boolean> {
    //noinspection ES6RedundantAwait
    return await this.databaseClient.$transaction(async (transaction): Promise<boolean> => {
      await transaction.$queryRaw`
        SELECT
        FROM "auth_users_linked_providers"
        WHERE "user_id" = ${apolloUserId}
        FOR UPDATE
      `;

      const deleteResult = await transaction.authUserLinkedProvider.deleteMany({
        where: {
          userId: apolloUserId,
          providerId,
        },
      });
      if (deleteResult.count === 0) {
        return false;
      }

      const remainingLinkedProviders = await transaction.authUserLinkedProvider.count({ where: { userId: apolloUserId } });
      if (remainingLinkedProviders === 0) {
        throw new Error('Cannot unlink the only remaining linked provider from an account');
      }

      return true;
    });
  }

  private async preProcessProfilePicture(rawProfilePictureBytes: Buffer | null): Promise<Buffer<ArrayBuffer> | null> {
    if (rawProfilePictureBytes == null) {
      return null;
    }

    return Buffer.from(await this.profilePicturePreProcessor.processForOAuthLink(rawProfilePictureBytes));
  }
}
