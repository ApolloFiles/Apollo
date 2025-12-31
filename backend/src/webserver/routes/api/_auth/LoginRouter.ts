import type { FastifyReply } from 'fastify';
import * as OpenIdClient from 'openid-client';
import { injectable } from 'tsyringe';
import OAuthConfigurationProvider, { type OAuthConfig } from '../../../../auth/oauth/OAuthConfigurationProvider.js';
import AuthAnonymousSessionHelper from '../../../../auth/session/anonymous/AuthAnonymousSessionHelper.js';
import SessionCookieHelper from '../../../../auth/session/SessionCookieHelper.js';
import AppConfiguration from '../../../../config/AppConfiguration.js';
import { ContainerTokens } from '../../../../constants.js';
import { BadRequestError } from '../../../errors/HttpErrors.js';
import type { FastifyInstanceWithZod } from '../../../server/FastifyWebServer.js';
import type { RouteReturn } from '../../Router.js';
import AbstractLoginRouter, { type LoginStateData } from './AbstractLoginRouter.js';

// TODO: Instead of sending error response, redirect to SvelteKit with error query param?
@injectable({ token: ContainerTokens.ROUTER })
export default class LoginRouter extends AbstractLoginRouter {
  public constructor(
    oAuthConfigurationProvider: OAuthConfigurationProvider,
    private readonly appConfig: AppConfiguration,
    private readonly anonymousSessionCreator: AuthAnonymousSessionHelper,
    private readonly sessionCookieHelper: SessionCookieHelper,
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
    server.get('/login/:providerType', this.ROUTE_OPTIONS, async (request, reply): Promise<RouteReturn> => {
      this.ensureNotAlreadyLoggedIn(request);

      const oAuthConfig = await this.determineOAuthConfig(request.params.providerType);
      const authorizationUrl = await this.initiateOAuthLoginFlow(reply, oAuthConfig);

      return reply.redirect(authorizationUrl.href, 302);
    });

    server.get('/login/:providerType/link', this.ROUTE_OPTIONS, async (request, reply): Promise<RouteReturn> => {
      const sessionUser = request.getSessionUserOptional();
      if (sessionUser == null) {
        throw new BadRequestError('You must be logged in to link an OAuth provider to your account');
      }

      const oAuthConfig = await this.determineOAuthConfig(request.params.providerType);
      const authorizationUrl = await this.initiateOAuthLoginFlow(reply, oAuthConfig, sessionUser.session.id);

      return reply.redirect(authorizationUrl.href, 302);
    });
  }

  private async initiateOAuthLoginFlow(reply: FastifyReply, oAuthConfig: OAuthConfig, linkWithSessionId?: bigint): Promise<URL> {
    const code_verifier = OpenIdClient.randomPKCECodeVerifier();
    const state = OpenIdClient.randomState();
    const nonce: string | undefined = undefined;// OpenIdClient.randomNonce();  // TODO: Only generate nonce for OpenID providers (OAuth itself won't work with nonce)

    await this.createAnonymousSession(reply, {
      code_verifier,
      state,
      linkWithExistingApolloAccount: linkWithSessionId != null ? { sessionId: linkWithSessionId } : undefined,
    });

    return OpenIdClient.buildAuthorizationUrl(
      oAuthConfig.openIdConfig,
      {
        scope: oAuthConfig.scopes.join(' '),
        redirect_uri: `${this.appConfig.config.baseUrl}/api/_auth/login/${oAuthConfig.type}/callback`,

        state,
        // nonce: nonce, // TODO
        code_challenge: await OpenIdClient.calculatePKCECodeChallenge(code_verifier),
        code_challenge_method: 'S256',
      },
    );
  }

  private async createAnonymousSession(reply: FastifyReply, data: LoginStateData): Promise<void> {
    const anonymousSession = await this.anonymousSessionCreator.create(data);
    this.sessionCookieHelper.setSessionCookie(reply, true, anonymousSession.token, anonymousSession.remainingLifetimeInSeconds);
  }
}
