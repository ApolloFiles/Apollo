import express from 'express';
import NEW_VideoLiveTranscodeTemplate from '../../frontend/NEW_VideoLiveTranscodeTemplate';
import Utils from '../../Utils';
import WebServer from '../../webserver/WebServer';
import { WS_CLOSE_PROTOCOL_ERROR } from './sessions/WatchSessionClient';
import WatchSessionStorage from './sessions/WatchSessionStorage';

export function createWatchRouter(webserver: WebServer): express.Router {
  const router = express.Router();

  const sessionStorage = new WatchSessionStorage();
  attachWebSocketConnectionHandler(webserver, sessionStorage);

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
          sessionId: session.id,
          sessionDisplayName: req.user?.getDisplayName() ?? 'Anonymous'
        }));
      }
    });
  });

  return router;
}

function attachWebSocketConnectionHandler(webserver: WebServer, sessionStorage: WatchSessionStorage): void {
  const mountRoot = '/_ws/media/watch/';

  webserver.addListenEventHandler(() => {
    const websocketServer = webserver.getWebSocketServer();
    if (websocketServer == null) {
      throw new Error('WebSocket server not initialized');
    }

    websocketServer.on('connection', (client, request) => {
      client.on('error', console.error);

      if (!request.url?.startsWith(mountRoot)) {
        client.close(WS_CLOSE_PROTOCOL_ERROR, 'Invalid path');
        return;
      }

      // TODO: Check sub-protocol
      // TODO: Check Apollo login

      const sessionIdAndPotentialGetParams = request.url.substring(mountRoot.length);
      const sessionId = sessionIdAndPotentialGetParams.split('?')[0];

      const session = sessionStorage.find(sessionId);
      if (session == null) {
        client.close(WS_CLOSE_PROTOCOL_ERROR, 'Invalid session ID');
        return;
      }

      // TODO: Check file/session access

      const getParams = new URLSearchParams(sessionIdAndPotentialGetParams.split('?')[1]);
      session.welcomeClient(client, getParams.get('displayName') ?? 'Anonymous')
          .catch(console.error);
    });
  });
}
