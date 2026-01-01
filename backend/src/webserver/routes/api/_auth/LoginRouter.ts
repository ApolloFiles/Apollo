import type { FastifyReply } from 'fastify';
import * as OpenIdClient from 'openid-client';
import { injectable } from 'tsyringe';
import { z } from 'zod';
import AccountCreationInviteFinder from '../../../../auth/account_creation_invite/AccountCreationInviteFinder.js';
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
    private readonly accountCreationInviteFinder: AccountCreationInviteFinder,
  ) {
    super(oAuthConfigurationProvider);
  }

  getRoutePrefix(): string {
    return '/api/_auth/';
  }

  allowUnauthenticatedAccess(): boolean {
    return true;
  }

  // TODO: refactor into individual router classes
  register(server: FastifyInstanceWithZod): void {
    server.get('/login/:providerType', this.ROUTE_OPTIONS, async (request, reply): Promise<RouteReturn> => {
      this.ensureNotAlreadyLoggedIn(request);

      const oAuthConfig = await this.determineOAuthConfig(request.params.providerType);
      const authorizationUrl = await this.initiateOAuthLoginFlow(reply, oAuthConfig);

      return reply.redirect(authorizationUrl.href, 302);
    });

    server.get('/link/:providerType', this.ROUTE_OPTIONS, async (request, reply): Promise<RouteReturn> => {
      const sessionUser = request.getSessionUserOptional();
      if (sessionUser == null) {
        throw new BadRequestError('You must be logged in to link an OAuth provider to your account');
      }

      const oAuthConfig = await this.determineOAuthConfig(request.params.providerType);
      const authorizationUrl = await this.initiateOAuthLoginFlow(
        reply,
        oAuthConfig,
        { action: 'linkWithExisting', sessionId: sessionUser.session.id },
      );

      return reply.redirect(authorizationUrl.href, 302);
    });

    server.get(
      '/sign-up/:providerType',
      {
        ...this.ROUTE_OPTIONS,
        schema: {
          ...this.ROUTE_OPTIONS.schema,
          querystring: z.object({ token: z.string().nonempty() }),
        },
      },
      async (request, reply): Promise<RouteReturn> => {
        this.ensureNotAlreadyLoggedIn(request);

        const inviteToken = await this.accountCreationInviteFinder.findByToken(request.query.token);
        if (inviteToken == null) {
          throw new BadRequestError('The invite token is invalid or expired');
        }

        const oAuthConfig = await this.determineOAuthConfig(request.params.providerType);
        const authorizationUrl = await this.initiateOAuthLoginFlow(
          reply,
          oAuthConfig,
          {
            action: 'accountCreationInvite',
            inviteTokenHash: inviteToken.hashedToken,
          });

        return reply.redirect(authorizationUrl.href, 302);
      },
    );
  }

  private async initiateOAuthLoginFlow(reply: FastifyReply, oAuthConfig: OAuthConfig, specialAction?: LoginStateData['specialAction']): Promise<URL> {
    const code_verifier = OpenIdClient.randomPKCECodeVerifier();
    const state = OpenIdClient.randomState();
    const nonce: string | undefined = undefined;// OpenIdClient.randomNonce();  // TODO: Only generate nonce for OpenID providers (OAuth itself won't work with nonce)

    await this.createAnonymousSession(reply, {
      code_verifier,
      state,
      specialAction,
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
