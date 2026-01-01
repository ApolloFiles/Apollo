import { injectable } from 'tsyringe';
import AuthSessionRevoker from '../../../../auth/session/AuthSessionRevoker.js';
import SessionCookieHelper from '../../../../auth/session/SessionCookieHelper.js';
import { ContainerTokens } from '../../../../constants.js';
import type { FastifyInstanceWithZod } from '../../../server/FastifyWebServer.js';
import type { default as Router, RouteReturn } from '../../Router.js';

@injectable({ token: ContainerTokens.ROUTER })
export default class LogoutRouter implements Router {
  constructor(
    private readonly sessionCookieHelper: SessionCookieHelper,
    private readonly authSessionRevoker: AuthSessionRevoker,
  ) {
  }

  getRoutePrefix(): string {
    return '/api/_auth/';
  }

  allowUnauthenticatedAccess(): boolean {
    return true;
  }

  register(server: FastifyInstanceWithZod): void {
    server.get('/logout', async (request, reply): Promise<RouteReturn> => {
      const activeSession = request.getSessionUserOptional()?.session;
      if (activeSession != null) {
        await this.authSessionRevoker.revoke(activeSession.id, activeSession.user.id);
      }

      this.sessionCookieHelper.unsetCookie(reply, false);
      this.sessionCookieHelper.unsetCookie(reply, true);

      return reply.redirect('/', 302);
    });
  }
}
