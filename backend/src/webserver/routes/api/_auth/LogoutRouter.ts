import { injectable } from 'tsyringe';
import SessionCookieHelper from '../../../../auth/session/SessionCookieHelper.js';
import { ContainerTokens } from '../../../../constants.js';
import type { FastifyInstanceWithZod } from '../../../server/FastifyWebServer.js';
import type { default as Router, RouteReturn } from '../../Router.js';

@injectable({ token: ContainerTokens.ROUTER })
export default class LogoutRouter implements Router {
  constructor(
    private readonly sessionCookieHelper: SessionCookieHelper,
  ) {
  }

  getRoutePrefix(): string {
    return '/api/_auth/';
  }

  allowUnauthenticatedAccess(): boolean {
    return true;
  }

  register(server: FastifyInstanceWithZod): void {
    server.get('/logout', async (_request, reply): Promise<RouteReturn> => {
      this.sessionCookieHelper.unsetCookie(reply, false);
      this.sessionCookieHelper.unsetCookie(reply, true);

      return reply.redirect('/', 302);
    });
  }
}
