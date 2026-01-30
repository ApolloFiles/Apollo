import { injectable } from 'tsyringe';
import OAuthConfigurationProvider from '../../../../auth/oauth/OAuthConfigurationProvider.js';
import AuthSessionFinder from '../../../../auth/session/AuthSessionFinder.js';
import AuthSessionRevoker from '../../../../auth/session/AuthSessionRevoker.js';
import DatabaseClient from '../../../../database/DatabaseClient.js';
import UploadedProfilePicturePreProcessor from '../../../../user/picture/UploadedProfilePicturePreProcessor.js';
import type { ORpcImplementer, SubRouter } from '../ORpcRouter.js';

@injectable()
export default class UserORpcRouterFactory {
  constructor(
    private readonly databaseClient: DatabaseClient,
    private readonly profilePictureProcessor: UploadedProfilePicturePreProcessor,
    private readonly oAuthConfigurationProvider: OAuthConfigurationProvider,
    private readonly authSessionFinder: AuthSessionFinder,
    private readonly authSessionRevoker: AuthSessionRevoker,
  ) {
  }

  create(os: ORpcImplementer['user']): SubRouter<'user'> {
    return {
      get: os.get.handler(({ context }) => {
        return {
          id: context.sessionInfo.user.id,
          displayName: context.sessionInfo.user.name,
          isSuperUser: context.sessionInfo.user.isSuperUser,
        };
      }),

      settings: {
        profile: {
          updateDisplayName: os.settings.profile.updateDisplayName
            .handler(async ({ input, context }) => {
              await this.databaseClient.authUser.update({
                where: { id: context.sessionInfo.user.id },
                data: {
                  displayName: input.displayName,
                },
              });
            }),

          updateProfilePicture: os.settings.profile.updateProfilePicture
            .handler(async ({ input, context, errors }) => {
              let profilePictureBytes: Buffer | null;
              try {
                profilePictureBytes = input.file != null
                  ? await this.profilePictureProcessor.processForUserProfile(Buffer.from(await input.file.arrayBuffer()))
                  : null;
              } catch (err) {
                throw errors.UNSUPPORTED_FILE();
              }

              await this.databaseClient.authUser.update({
                where: { id: context.sessionInfo.user.id },
                data: {
                  profilePicture: profilePictureBytes != null ? Buffer.from(profilePictureBytes) : null,
                },
              });
            }),
        },

        security: {
          get: os.settings.security.get
            .handler(async ({ context }) => {
              const sessionInfo = context.sessionInfo;

              const linkedAuthProviders = await this.databaseClient.authUserLinkedProvider.findMany({
                where: {
                  userId: sessionInfo.user.id,
                },
                select: {
                  providerId: true,
                  providerUserId: true,
                  providerUserDisplayName: true,
                  linkedAt: true,
                },
                orderBy: { providerId: 'asc' },
              });

              return {
                // TODO: Would be sick to change the profile picture system, so that we have something to send in loggedInUser too
                //       That would allow the user to update the profile picture in browser tab A, and see the new picture
                //       in browser tab B without a full page reloading
                loggedInUser: {
                  id: sessionInfo.user.id,
                  displayName: sessionInfo.user.name,
                  isSuperUser: sessionInfo.user.isSuperUser,
                },

                sessions: {
                  currentId: sessionInfo.session.id,
                  all: await this.authSessionFinder.findByUserId(sessionInfo.user.id),
                },
                linkedAuthProviders: linkedAuthProviders.map((linkedProvider) => {
                  const providerInfo: {
                    identifier: string,
                    displayName: string,
                  } = this.oAuthConfigurationProvider.getProviderInfo(linkedProvider.providerId) ?? {
                    identifiers: linkedProvider.providerId,
                    displayName: linkedProvider.providerId,
                  };

                  return {
                    ...providerInfo,
                    providerUserId: linkedProvider.providerUserId,
                    providerUserDisplayName: linkedProvider.providerUserDisplayName,
                    linkedAt: linkedProvider.linkedAt,
                  };
                }),
                allAuthProviderTypes: this.oAuthConfigurationProvider.getAvailableTypes().sort((a, b) => {
                  return a.displayName.localeCompare(b.displayName);
                }),
              };
            }),

          revokeSingleSession: os.settings.security.revokeSingleSession
            .handler(async ({ input, context }) => {
              await this.authSessionRevoker.revoke(input.sessionId, context.sessionInfo.user.id);
            }),

          revokeAllSessionsExceptCurrent: os.settings.security.revokeAllSessionsExceptCurrent
            .handler(async ({ context }) => {
              const sessionInfo = context.sessionInfo;
              await this.authSessionRevoker.revokeAllForUserExcept(sessionInfo.user.id, sessionInfo.session.id);
            }),
        },
      },
    };
  }
}
