import express from 'express';
import AbstractUser from '../../AbstractUser';
import NEW_VideoLiveTranscodeTemplate from '../../frontend/NEW_VideoLiveTranscodeTemplate';
import UserStorage from '../../UserStorage';
import Utils from '../../Utils';
import WebServer from '../../webserver/WebServer';
import { WS_CLOSE_PROTOCOL_ERROR } from './sessions/WatchSessionClient';
import WatchSessionStorage from './sessions/WatchSessionStorage';

export function createWatchRouter(webserver: WebServer, sessionMiddleware: express.RequestHandler): express.Router {
  const router = express.Router();

  const sessionStorage = new WatchSessionStorage();
  attachWebSocketConnectionHandler(webserver, sessionMiddleware, sessionStorage);

  router.use('/new', (req: express.Request, res: express.Response, next) => {
    if (req.path !== '/') {
      next();
      return;
    }

    Utils.restful(req, res, next, {
      get: async (): Promise<void> => {
        const session = sessionStorage.create();
        res.redirect(`./s/${session.id}`);
      }
    });
  });

  router.use('/s/:sessionId/f/', (req: express.Request, res: express.Response, next) => {
    Utils.restful(req, res, next, {
      get: async (): Promise<void> => {
        const sessionId = req.params.sessionId;
        res.send('GET ' + Utils.escapeHtml(req.baseUrl) + ' (sessionId: ' + Utils.escapeHtml(sessionId) + ')');
      }
    });
  });

  router.use('/s/:sessionId', (req: express.Request, res: express.Response, next) => {
    if (req.path !== '/') {
      next();
      return;
    }

    Utils.restful(req, res, next, {
      get: async (): Promise<void> => {
        const session = sessionStorage.find(req.params.sessionId);

        if (session == null) {
          res.status(404)
              .send('<h1>404 Session not found</h1><a href="../new">Create a new one</a>');
          return;
        }

        res.send(new NEW_VideoLiveTranscodeTemplate().render(req, {
          sessionId: session.id
        }));
      }
    });
  });

  return router;
}

function attachWebSocketConnectionHandler(webserver: WebServer, sessionMiddleware: express.RequestHandler, sessionStorage: WatchSessionStorage): void {
  const mountRoot = '/_ws/media/watch/';

  async function callSessionMiddleware(req: express.Request): Promise<void> {
    return new Promise((resolve) => sessionMiddleware(req, {} as express.Response, () => resolve()));
  }

  webserver.addListenEventHandler(() => {
    const websocketServer = webserver.getWebSocketServer();
    if (websocketServer == null) {
      throw new Error('WebSocket server not initialized');
    }

    websocketServer.on('connection', async (client, request): Promise<void> => {
      client.on('error', console.error);

      if (!request.url?.startsWith(mountRoot)) {
        client.close(WS_CLOSE_PROTOCOL_ERROR, 'Invalid path');
        return;
      }

      // TODO: Check sub-protocol

      await callSessionMiddleware(request as any);
      const sessionUserId = (request as any).session?.userId;

      let user: AbstractUser | null = null;
      if (typeof sessionUserId == 'number') {
        user = await new UserStorage().getUser(sessionUserId);
      }
      if (user == null) {
        client.close(WS_CLOSE_PROTOCOL_ERROR, 'Not logged into Apollo');
        return;
      }
      client.apollo.user = user;

      const sessionIdAndPotentialGetParams = request.url.substring(mountRoot.length);
      const sessionId = sessionIdAndPotentialGetParams.split('?')[0];

      const session = sessionStorage.find(sessionId);
      if (session == null) {
        client.close(WS_CLOSE_PROTOCOL_ERROR, 'Invalid session ID');
        return;
      }

      // TODO: Check file/session access

      session.welcomeClient(client, client.apollo.user.getDisplayName())
          .catch(console.error);
    });
  });
}
