import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { injectable } from 'tsyringe';
import { ContainerTokens } from '../../../../constants.js';
import { auth, convertHeadersIntoBetterAuthFormat } from '../../../../utils/auth.js';
import type { default as Router, RouteReturn } from '../../Router.js';

@injectable({ token: ContainerTokens.ROUTER })
export default class BetterAuthRouter implements Router {
  register(server: FastifyInstance): void {
    // TODO: CORS
    server.route({
      method: ['GET', 'POST'],
      url: '/api/_auth/*',
      handler: async (request, reply): Promise<RouteReturn> => {
        const betterAuthRequest = this.convertFastifyRequestIntoFetchApiRequest(request);
        const betterAuthResponse = await auth.handler(betterAuthRequest);

        return this.applyBetterAuthResponseToFastifyReply(betterAuthResponse, reply);
      },
    });
  }

  private convertFastifyRequestIntoFetchApiRequest(request: FastifyRequest): Request {
    const requestUrl = this.determineRequestUrl(request);
    const headers = convertHeadersIntoBetterAuthFormat(request.headers);

    return new Request(requestUrl.toString(), {
      method: request.method,
      headers,
      body: request.body ? JSON.stringify(request.body) : undefined,
    });
  }

  private determineRequestUrl(request: FastifyRequest): URL {
    return new URL(request.url, `${request.protocol}://${request.headers.host}`);
  }

  private async applyBetterAuthResponseToFastifyReply(betterAuthResponse: Response, reply: FastifyReply): Promise<FastifyReply> {
    for (const [key, value] of betterAuthResponse.headers.entries()) {
      reply.header(key, value);
    }

    return reply
      .status(betterAuthResponse.status)
      .send(betterAuthResponse.body ? await betterAuthResponse.bytes() : null);
  }
}
