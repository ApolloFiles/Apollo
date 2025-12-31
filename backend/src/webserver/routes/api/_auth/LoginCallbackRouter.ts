import type { FastifyReply, FastifyRequest } from 'fastify';
import * as OpenIdClient from 'openid-client';
import { injectable } from 'tsyringe';
import OAuthConfigurationProvider, { type OAuthConfig } from '../../../../auth/oauth/OAuthConfigurationProvider.js';
import OAuthLinkPersister from '../../../../auth/oauth/OAuthLinkPersister.js';
import UserByOAuthProvider from '../../../../auth/oauth/UserByOAuthProvider.js';
import AuthAnonymousSessionHelper from '../../../../auth/session/anonymous/AuthAnonymousSessionHelper.js';
import AuthSessionCreator from '../../../../auth/session/AuthSessionCreator.js';
import SessionCookieHelper from '../../../../auth/session/SessionCookieHelper.js';
import AppConfiguration from '../../../../config/AppConfiguration.js';
import { ContainerTokens } from '../../../../constants.js';
import type ApolloUser from '../../../../user/ApolloUser.js';
import { BadRequestError } from '../../../errors/HttpErrors.js';
import type { FastifyInstanceWithZod } from '../../../server/FastifyWebServer.js';
import type { RouteReturn } from '../../Router.js';
import AbstractLoginRouter, { type LoginStateData } from './AbstractLoginRouter.js';

type OpenIdTokenResponse = OpenIdClient.TokenEndpointResponse & OpenIdClient.TokenEndpointResponseHelpers;

// TODO: Instead of sending error response, redirect to SvelteKit with error query param?
@injectable({ token: ContainerTokens.ROUTER })
export default class LoginRouter extends AbstractLoginRouter {
  public constructor(
    oAuthConfigurationProvider: OAuthConfigurationProvider,
    private readonly appConfig: AppConfiguration,
    private readonly sessionCreator: AuthSessionCreator,
    private readonly anonymousSessionHelper: AuthAnonymousSessionHelper,
    private readonly sessionCookieHelper: SessionCookieHelper,
    private readonly userByOAuthProvider: UserByOAuthProvider,
    private readonly oAuthLinkPersister: OAuthLinkPersister,
  ) {
    super(oAuthConfigurationProvider);
  }

  getRoutePrefix(): string {
    return '/api/_auth/';
  }

  allowUnauthenticatedAccess(): boolean {
    return true;
  }

  register(server: FastifyInstanceWithZod): void {
    server.get('/login/:providerType/callback', this.ROUTE_OPTIONS, async (request, reply): Promise<RouteReturn> => {
      const oAuthConfig = await this.determineOAuthConfig(request.params.providerType);

      const loginState = await this.extractLoginStateFromRequest(request, reply);
      if (loginState.linkWithExistingApolloAccount != null && loginState.linkWithExistingApolloAccount.sessionId !== request.getSessionUserOptional()?.session.id) {
        throw new BadRequestError('Cannot link accounts: no valid session found for linking');
      }

      const tokenResponse = await this.acquireAccessToken(request, oAuthConfig, loginState);
      const userInfo = await oAuthConfig.fetchUserInfo(oAuthConfig.openIdConfig, tokenResponse.access_token, tokenResponse.claims()?.sub);

      if (loginState.linkWithExistingApolloAccount != null) {
        const apolloUser = await this.userByOAuthProvider.provide(oAuthConfig.type, userInfo.id);
        if (apolloUser != null) {
          throw new BadRequestError('Cannot link accounts: OAuth provider account is already linked with another account');
        }

        // TODO: Check and try to link with current session/account
        await this.oAuthLinkPersister.createLink(
          oAuthConfig.type,
          request.getAuthenticatedUser().id,
          userInfo.id,
          userInfo.displayName,
          userInfo.profilePictureBytes,
        );
      } else {
        const apolloUser = await this.userByOAuthProvider.provide(oAuthConfig.type, userInfo.id);
        if (apolloUser == null) {
          throw new BadRequestError('Cannot log in: user not found');
        }
        if (apolloUser.blocked) {
          throw new BadRequestError('Cannot log in: account is blocked');
        }

        await this.oAuthLinkPersister.updateLinkData(
          oAuthConfig.type,
          apolloUser.id,
          userInfo.displayName,
          userInfo.profilePictureBytes,
        );

        await this.createSession(request, reply, apolloUser);
      }

      return reply.redirect('/', 302);
    });
  }

  private async createSession(request: FastifyRequest, reply: FastifyReply, user: ApolloUser): Promise<void> {
    const session = await this.sessionCreator.create(user.id, request.headers['user-agent'] ?? '');
    this.sessionCookieHelper.setSessionCookie(reply, false, session.token, session.remainingLifetimeInSeconds);
  }

  private acquireAccessToken(request: FastifyRequest, oAuthConfig: OAuthConfig, loginState: LoginStateData): Promise<OpenIdTokenResponse> {
    return OpenIdClient.authorizationCodeGrant(
      oAuthConfig.openIdConfig,
      new URL(request.originalUrl, this.appConfig.config.baseUrl),
      {
        pkceCodeVerifier: loginState.code_verifier,
        expectedState: loginState.state,
        expectedNonce: loginState.nonce,
      },
    );
  }

  /**
   * @throws {BadRequestError}
   */
  private async extractLoginStateFromRequest(request: FastifyRequest, reply: FastifyReply): Promise<LoginStateData> {
    const anonymousSessionToken = this.sessionCookieHelper.extractSessionCookieValue(request.cookies, true);
    this.sessionCookieHelper.unsetCookie(reply, true);

    if (anonymousSessionToken == null) {
      throw new BadRequestError('No ongoing authorization request found – Please try again');
    }

    const anonymousSessionDataRaw = await this.anonymousSessionHelper.invalidate(anonymousSessionToken);

    const anonymousSessionData = this.LOGIN_STATE_SCHEMA.safeParse(anonymousSessionDataRaw);
    if (anonymousSessionData.data == null) {
      throw new BadRequestError('Invalid authorization data (maybe another browser tab was active?) – Please try again');
    }
    return anonymousSessionData.data;
  }
}
