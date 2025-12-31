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

  async updateLinkData(type: OAuthType, apolloUserId: string, displayName: string, rawProfilePictureBytes: Buffer | null): Promise<void> {
    let profilePictureBytes: Buffer<ArrayBuffer> | null = null;

    if (rawProfilePictureBytes != null) {
      const processedImage = await this.profilePicturePreProcessor.processForOAuthLink(rawProfilePictureBytes);
      profilePictureBytes = Buffer.from(processedImage);
    }

    await this.databaseClient.authUserLinkedProvider.update({
      where: {
        apolloUserId_provider: {
          apolloUserId,
          provider: type,
        },
      },
      data: {
        providerUserDisplayName: displayName,
        providerProfilePicture: profilePictureBytes ? Buffer.from(profilePictureBytes) : null,
      },

      select: { provider: true },
    });
  }
}
