import { singleton } from 'tsyringe';
import DatabaseClient from '../../database/DatabaseClient.js';
import UploadedProfilePicturePreProcessor from '../../user/picture/UploadedProfilePicturePreProcessor.js';
import type { OAuthType } from './OAuthConfigurationProvider.js';

@singleton()
export default class OAuthLinkPersister {
  constructor(
    private readonly databaseClient: DatabaseClient,
    private readonly profilePicturePreProcessor: UploadedProfilePicturePreProcessor,
  ) {
  }

  async createLink(type: OAuthType, apolloUserId: string, providerUserId: string, displayName: string, rawProfilePictureBytes: Buffer | null): Promise<void> {
    const profilePictureBytes = await this.preProcessProfilePicture(rawProfilePictureBytes);

    await this.databaseClient.authUserLinkedProvider.create({
      data: {
        provider: type,
        apolloUserId,
        providerUserId,
        providerUserDisplayName: displayName,
        providerProfilePicture: profilePictureBytes,
      },

      select: { provider: true },
    });
  }

  async updateLinkData(type: OAuthType, apolloUserId: string, displayName: string, rawProfilePictureBytes: Buffer | null): Promise<void> {
    const profilePictureBytes = await this.preProcessProfilePicture(rawProfilePictureBytes);

    await this.databaseClient.authUserLinkedProvider.update({
      where: {
        apolloUserId_provider: {
          apolloUserId,
          provider: type,
        },
      },
      data: {
        providerUserDisplayName: displayName,
        providerProfilePicture: profilePictureBytes,
      },

      select: { provider: true },
    });
  }

  async unlinkProvider(type: OAuthType, apolloUserId: string): Promise<boolean> {
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
          apolloUserId,
          provider: type,
        },
      });
      if (deleteResult.count === 0) {
        return false;
      }

      const remainingLinkedProviders = await transaction.authUserLinkedProvider.count({ where: { apolloUserId } });
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
