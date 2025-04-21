import { handleRequestRestfully } from '@spraxdev/node-commons';
import express from 'express';
import Fs from 'node:fs';
import Path from 'node:path';
import { getFileNameCollator, getFileTypeUtils } from '../../Constants';
import NEW_VideoLiveTranscodeTemplate from '../../frontend/NEW_VideoLiveTranscodeTemplate';
import { ApolloWebSocket } from '../../global';
import ApolloUser from '../../user/ApolloUser';
import ApolloUserStorage from '../../user/ApolloUserStorage';
import LocalFile from '../../user/files/local/LocalFile';
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

    handleRequestRestfully(req, res, next, {
      get: async (): Promise<void> => {
        const session = sessionStorage.create();
        res.redirect(`./s/${session.id}`);
      },
    });
  });

  router.use('/s/:sessionId/f/', (req: express.Request, res: express.Response, next) => {
    handleRequestRestfully(req, res, next, {
      get: async (): Promise<void> => {
        const session = sessionStorage.find(req.params.sessionId);
        if (session == null) {
          res
            .status(404)
            .send('Session not found');
          return;
        }

        const requestedFilePathOnHost = Path.join(session.workingDir.publicPath, req.path);
        if (!requestedFilePathOnHost.startsWith(session.workingDir.publicPath)) {
          res
            .status(403)
            .send('Forbidden');
          return;
        }

        if (!Fs.existsSync(requestedFilePathOnHost)) {
          if (Fs.existsSync(requestedFilePathOnHost + '.wip')) {
            res
              .status(202)
              .send('Looks like the requested file is not ready yet. Please try again later.');
            return;
          }

          res
            .status(404)
            .send('VirtualFile not found');
          return;
        }

        const mimeType = await getFileTypeUtils().getMimeType(requestedFilePathOnHost);
        await Utils.sendFileRespectingRequestedRange(req, res, requestedFilePathOnHost, mimeType ?? 'application/octet-stream');
      },
    });
  });

  router.use('/s/:sessionId', (req: express.Request, res: express.Response, next) => {
    if (req.path !== '/') {
      next();
      return;
    }

    handleRequestRestfully(req, res, next, {
      get: async (): Promise<void> => {
        const session = sessionStorage.find(req.params.sessionId);

        if (session == null) {
          res.status(404)
            .send('<h1>404 Session not found</h1><a href="../new">Create a new one</a>');
          return;
        }

        res.send(new NEW_VideoLiveTranscodeTemplate().render(req, {
          sessionId: session.id,
        }));
      },
    });
  });

  router.use('/tmp_api/files/list', (req: express.Request, res: express.Response, next) => {
    handleRequestRestfully(req, res, next, {
      get: async (): Promise<void> => {
        const startPath = req.query.startPath;
        if (typeof startPath != 'string' || !Path.isAbsolute(startPath)) {
          res.status(400).send();
          return;
        }

        const user = WebServer.getUser(req);
        const fileSystem = user.getDefaultFileSystem();
        const files = await fileSystem.getFile(startPath).getFiles();

        const directoryFiles: LocalFile[] = [];
        for (const innerFile of files) {
          try {
            if (await innerFile.isDirectory()) {
              directoryFiles.push(innerFile);
            }
          } catch (err: any) {
            if (err?.code != 'ENOENT') {
              throw err;
            }
          }
        }

        files.sort((a, b) => {
          if (directoryFiles.includes(a) && !directoryFiles.includes(b)) {
            return -1;
          }
          if (!directoryFiles.includes(a) && directoryFiles.includes(b)) {
            return 1;
          }

          return getFileNameCollator().compare(a.getFileName(), b.getFileName());
        });

        const result: { path: string, name: string, isDir: boolean }[] = [];
        for (const file of files) {
          result.push({
            path: file.path,
            name: file.getFileName(),
            isDir: directoryFiles.includes(file),
          });
        }

        if (startPath !== '/') {
          result.unshift({ path: Path.dirname(startPath), name: '..', isDir: true });
        }
        res.json(result);
      },
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

    websocketServer.on('connection', async (client: ApolloWebSocket, request): Promise<void> => {
      client.on('error', console.error);

      if (!request.url?.startsWith(mountRoot)) {
        client.close(WS_CLOSE_PROTOCOL_ERROR, 'Invalid path');
        return;
      }

      // TODO: Check sub-protocol

      await callSessionMiddleware(request as any);
      const sessionUserId = (request as any).session?.userId;

      let user: ApolloUser | null = null;
      if (typeof sessionUserId === 'string') {
        user = await new ApolloUserStorage().findById(BigInt(sessionUserId));
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

      session.welcomeClient(client, client.apollo.user.displayName)
        .catch(console.error);
    });
  });
}
