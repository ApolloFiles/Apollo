import { injectable } from 'tsyringe';
import AccessTokenFinder, { type AccessTokenData } from '../../../auth/access_token/AccessTokenFinder.js';
import AccessTokenRevoker from '../../../auth/access_token/AccessTokenRevoker.js';
import TokenRevocationFailedError from '../../../auth/access_token/error/TokenRevocationFailedError.js';
import TokenRotationFailedError from '../../../auth/access_token/error/TokenRotationFailedError.js';
import PersonalAccessTokenCreator from '../../../auth/access_token/personal/PersonalAccessTokenCreator.js';
import PersonalAccessTokenRotator from '../../../auth/access_token/personal/PersonalAccessTokenRotator.js';
import OAuthConfigurationProvider from '../../../auth/oauth/OAuthConfigurationProvider.js';
import AuthSessionFinder from '../../../auth/session/AuthSessionFinder.js';
import AuthSessionRevoker from '../../../auth/session/AuthSessionRevoker.js';
import DatabaseClient from '../../../database/DatabaseClient.js';
import UploadedProfilePicturePreProcessor from '../../../user/picture/UploadedProfilePicturePreProcessor.js';
import type { ORpcContractOutputs } from '../../contract/oRpcContract.js';
import type { ORpcImplementer, SubRouter } from '../ORpcRouter.js';

@injectable()
export default class UserORpcRouterFactory {
  constructor(
    private readonly databaseClient: DatabaseClient,
    private readonly profilePictureProcessor: UploadedProfilePicturePreProcessor,
    private readonly oAuthConfigurationProvider: OAuthConfigurationProvider,
    private readonly authSessionFinder: AuthSessionFinder,
    private readonly authSessionRevoker: AuthSessionRevoker,
    private readonly accessTokenFinder: AccessTokenFinder,
    private readonly accessTokenRevoker: AccessTokenRevoker,
    private readonly personalAccessTokenCreator: PersonalAccessTokenCreator,
    private readonly personalAccessTokenRotator: PersonalAccessTokenRotator,
  ) {
  }

  create(os: ORpcImplementer['user']): SubRouter<'user'> {
    return {
      get: os.get.handler(({ context }) => {
        return {
          id: context.authSession.user.id,
          csrfToken: context.authSession.csrfToken,
          displayName: context.authSession.user.displayName,
          isSuperUser: context.authSession.user.isSuperUser,
          uiLanguage: context.authSession.user.uiLanguage,
        };
      }),

      settings: {
        profile: {
          updateDisplayName: os.settings.profile.updateDisplayName
            .handler(async ({ input, context }) => {
              await this.databaseClient.authUser.update({
                where: { id: context.authSession.user.id },
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
                where: { id: context.authSession.user.id },
                data: {
                  profilePicture: profilePictureBytes != null ? Buffer.from(profilePictureBytes) : null,
                },
              });
            }),
        },

        language: {
          updateUiLanguage: os.settings.language.updateUiLanguage
            .handler(async ({ input, context }) => {
              await this.databaseClient.authUser.update({
                where: { id: context.authSession.user.id },
                data: {
                  uiLanguage: input.uiLanguage,
                },
              });
            }),
        },

        security: {
          get: os.settings.security.get
            .handler(async ({ context }) => {
              const linkedAuthProviders = await this.databaseClient.authUserLinkedProvider.findMany({
                where: {
                  userId: context.authSession.user.id,
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
                  id: context.authSession.user.id,
                  csrfToken: context.authSession.csrfToken,
                  displayName: context.authSession.user.displayName,
                  isSuperUser: context.authSession.user.isSuperUser,
                  uiLanguage: context.authSession.user.uiLanguage,
                },

                sessions: {
                  currentId: context.authSession.id,
                  all: (await this.authSessionFinder.findByUserId(context.authSession.user.id)).map(s => {
                    return {
                      id: s.id,
                      createdAt: s.createdAt,
                      expiresAt: s.expiresAt,
                      roughLastActivity: s.roughLastActivity,
                      userAgent: s.userAgent,
                    };
                  }),
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
              await this.authSessionRevoker.revoke(input.sessionId, context.authSession.user.id);
            }),

          revokeAllSessionsExceptCurrent: os.settings.security.revokeAllSessionsExceptCurrent
            .handler(async ({ context }) => {
              await this.authSessionRevoker.revokeAllForUserExcept(context.authSession.user.id, context.authSession.id);
            }),
        },

        accessTokens: {
          list: os.settings.accessTokens.list
            .handler(async ({ context }) => {
              const tokenList = await this.accessTokenFinder.findByUserId(context.authSession.user.id);
              return { tokens: tokenList.map((token) => this.mapAccessTokenForContract(token)) };
            }),
          create: os.settings.accessTokens.create
            .handler(async ({ input, context }) => {
              const createdToken = await this.personalAccessTokenCreator.create(
                context.authSession.user.id,
                {
                  name: input.name,
                  description: input.description,
                  lifetimeSeconds: input.lifetimeSeconds,
                },
              );

              return {
                fullToken: createdToken.fullToken,
                token: this.mapAccessTokenForContract(createdToken.tokenData),
              };
            }),
          rotate: os.settings.accessTokens.rotate
            .handler(async ({ input, context, errors }) => {
              try {
                const rotatedToken = await this.personalAccessTokenRotator.rotate(input.tokenId, context.authSession.user.id);
                return {
                  fullToken: rotatedToken.fullToken,
                };
              } catch (err) {
                if (err instanceof TokenRotationFailedError) {
                  throw errors.ROTATION_FAILED({ message: 'Rotation failed, it may have been revoked or expired in the meantime' });
                }

                throw err;
              }
            }),
          revoke: os.settings.accessTokens.revoke
            .handler(async ({ input, context, errors }) => {
              try {
                await this.accessTokenRevoker.revoke(input.tokenId, context.authSession.user.id);
              } catch (err) {
                if (err instanceof TokenRevocationFailedError) {
                  throw errors.REVOCATION_FAILED({ message: 'Revocation failed, it may have been revoked or expired in the meantime' });
                }

                throw err;
              }
            }),
        },
      },
    };
  }

  private mapAccessTokenForContract(token: AccessTokenData): ORpcContractOutputs['user']['settings']['accessTokens']['create']['token'] {
    return {
      id: token.id,
      tokenHint: token.tokenHint,
      name: token.name,
      description: token.description,

      createdAt: token.createdAt,
      expiresAt: token.expiresAt,
      rotatedAt: token.rotatedAt,
      revokedAt: token.revokedAt,
      roughLastUsedAt: token.roughLastUsedAt,
    };
  }
}
