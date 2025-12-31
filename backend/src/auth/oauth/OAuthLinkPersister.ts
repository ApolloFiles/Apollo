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

  private async preProcessProfilePicture(rawProfilePictureBytes: Buffer | null): Promise<Buffer<ArrayBuffer> | null> {
    if (rawProfilePictureBytes == null) {
      return null;
    }

    return Buffer.from(await this.profilePicturePreProcessor.processForOAuthLink(rawProfilePictureBytes));
  }
}
