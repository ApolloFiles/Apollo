import type * as Fastify from 'fastify';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import type {
  default as OAuthConfigurationProvider,
  OAuthConfig,
} from '../../../../auth/oauth/OAuthConfigurationProvider.js';
import { BadRequestError } from '../../../errors/HttpErrors.js';
import type { FastifyInstanceWithZod } from '../../../server/FastifyWebServer.js';
import type Router from '../../Router.js';

const LOGIN_STATE_SCHEMA = z.object({
  code_verifier: z.string(),
  state: z.string(),
  nonce: z.string().optional(),

  returnTo: z.string().startsWith('/').optional(),

  specialAction: z.discriminatedUnion('action', [
    z.object({ action: z.literal('linkWithExisting'), sessionId: z.coerce.bigint() }),
    z.object({ action: z.literal('accountCreationInvite'), inviteTokenHash: z.string() }),
  ]).optional(),
});
export type LoginStateData = z.infer<typeof LOGIN_STATE_SCHEMA>;

export default abstract class AbstractLoginRouter implements Router {
  protected readonly ROUTE_OPTIONS_GET = {
    schema: {
      params: z.object({
        providerType: z.string().nonempty(),
      }),
    },
  } satisfies Fastify.RouteShorthandOptions;
  protected readonly ROUTE_OPTIONS_POST = {
    schema: {
      body: z.object({
        providerType: z.string().nonempty(),
      }),
    },
  } satisfies Fastify.RouteShorthandOptions;
  protected readonly LOGIN_STATE_SCHEMA = LOGIN_STATE_SCHEMA;


  protected constructor(
    protected readonly oAuthConfigurationProvider: OAuthConfigurationProvider,
  ) {
  }

  abstract register(server: FastifyInstanceWithZod, options?: unknown): void;

  /**
   * @throws {BadRequestError}
   */
  protected ensureNotAlreadyLoggedIn(request: FastifyRequest): void {
    if (request.getSessionUserOptional() != null) {
      throw new BadRequestError('You are already logged in – Log out first, if you want to log in with another account');
    }
  }

  /**
   * @throws {BadRequestError}
   */
  protected async determineOAuthConfig(providerType: string): Promise<OAuthConfig> {
    if (!this.oAuthConfigurationProvider.isTypeAvailable(providerType)) {
      throw new BadRequestError(`Requested login with unavailable OAuth provider: ${JSON.stringify(providerType)}`);
    }

    return this.oAuthConfigurationProvider.createConfig(providerType);
  }
}
