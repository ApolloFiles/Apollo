import { type FastifyInstanceWithZod, HttpRouter, type RouteReturn } from '@sprax/node-framework/web';
import { z } from 'zod';
import AuthSessionRevoker from '../../../../auth/session/AuthSessionRevoker.js';
import SessionCookieHelper from '../../../../auth/session/SessionCookieHelper.js';
import type ApolloRouter from '../../../server/ApolloRouter.js';

@HttpRouter()
export default class LogoutRouter implements ApolloRouter {
  constructor(
    private readonly sessionCookieHelper: SessionCookieHelper,
    private readonly authSessionRevoker: AuthSessionRevoker,
  ) {
  }

  allowUnauthenticatedAccess(): boolean {
    return true;
  }

  register(server: FastifyInstanceWithZod): void {
    server.post(
      '/logout',
      {
        schema: {
          body: z.object({ csrfToken: z.string().optional() }),
        },
      },
      async (request, reply): Promise<RouteReturn> => {
        const activeSession = request.getSessionUserOptional()?.session;

        if (activeSession != null) {
          request.requireCsrf(request.body.csrfToken);
          await this.authSessionRevoker.revoke(activeSession.id, activeSession.user.id);
        }

        this.sessionCookieHelper.unsetCookie(reply, false);
        this.sessionCookieHelper.unsetCookie(reply, true);

        return reply.redirect('/', 302);
      });
  }
}
