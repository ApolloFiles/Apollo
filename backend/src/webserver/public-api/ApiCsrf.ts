import type { FastifyRequest } from 'fastify';
import { z } from 'zod';

/** CSRF protection for public API writes: cookie sessions must send the token in a header, bearer tokens are exempt */
export class ApiCsrf {
  static readonly HEADERS_SCHEMA = z.looseObject({
    'x-csrf-token': z.string()
      .optional()
      .describe('Required when authenticating with the session cookie instead of an access token'),
  });

  static requireForCookieSession(request: FastifyRequest): void {
    if (request.getSessionUserOptional() == null) {
      return;
    }

    const sentToken = request.headers['x-csrf-token'];
    request.requireCsrf(typeof sentToken === 'string' ? sentToken : undefined);
  }
}
