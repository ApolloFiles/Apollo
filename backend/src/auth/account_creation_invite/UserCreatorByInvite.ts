import { singleton } from 'tsyringe';
import DatabaseClient from '../../database/DatabaseClient.js';
import ApolloUser from '../../user/ApolloUser.js';
import UploadedProfilePicturePreProcessor from '../../user/picture/UploadedProfilePicturePreProcessor.js';
import SecureTokenHelper from '../SecureTokenHelper.js';

type ProcessedProfilePicture = {
  user: Buffer<ArrayBuffer>,
  oauth: Buffer<ArrayBuffer>,
}

@singleton()
export default class UserCreatorByInvite {
  constructor(
    private readonly databaseClient: DatabaseClient,
    private readonly secureTokenHelper: SecureTokenHelper,
    private readonly profilePicturePreProcessor: UploadedProfilePicturePreProcessor,
  ) {
  }

  async createByInviteTokenAndOAuth(
    hashedToken: string,
    providerId: string,
    providerUserId: string,
    providerUserDisplayName: string,
    rawProfilePictureBytes: Buffer | null,
  ): Promise<ApolloUser> {
    const createdUser = await this.databaseClient.$transaction(async (transaction) => {
      const inviteToken = await transaction.authAccountCreationInviteToken.delete({
        where: {
          hashedToken: this.secureTokenHelper.decodeHashedToken(hashedToken),
          expiresAt: { gt: await this.databaseClient.fetchNow() },
        },
        select: { createSuperUserAccount: true },
      });

      const profilePicture = await this.preProcessProfilePicture(rawProfilePictureBytes);

      return transaction.authUser.create({
        data: {
          displayName: providerUserDisplayName,
          profilePicture: profilePicture?.user,
          isSuperUser: inviteToken.createSuperUserAccount,

          linkedAuthProviders: {
            create: {
              providerId,
              providerUserId,
              providerUserDisplayName,
              providerUserProfilePicture: profilePicture?.oauth,
            },
          },
        },
        select: {
          id: true,
          displayName: true,
          isSuperUser: true,
          blocked: true,
        },
      });
    });

    return new ApolloUser(createdUser.id, createdUser.displayName, createdUser.blocked, createdUser.isSuperUser);
  }

  private async preProcessProfilePicture(rawProfilePictureBytes: Buffer | null): Promise<ProcessedProfilePicture | null> {
    if (rawProfilePictureBytes == null) {
      return null;
    }

    const [user, oauth] = await Promise.all([
      this.profilePicturePreProcessor.processForUserProfile(rawProfilePictureBytes),
      this.profilePicturePreProcessor.processForOAuthLink(rawProfilePictureBytes),
    ]);

    return {
      user: Buffer.from(user),
      oauth: Buffer.from(oauth),
    };
  }
}
