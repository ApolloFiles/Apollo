import {handleRequestRestfully} from '@spraxdev/node-commons';
import express from 'express';
import {getFileNameCollator} from '../../Constants';
import Utils from '../../Utils';
import WebServer from '../WebServer';

export const apiRouter = express.Router();

function requireAuthMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (req.user == null) {
    res
      .status(401)
      .type('application/json')
      .send();
    return;
  }

  next();
}

apiRouter.use('/v1/userinfo', requireAuthMiddleware, (req, res, next) => {
  handleRequestRestfully(req, res, next, {
    get: () => {
      const user = WebServer.getUser(req);
      res
        .status(200)
        .type('application/json')
        .send({
          id: user.getId(),
          displayName: user.getDisplayName()
        });
    }
  });
});

apiRouter.use('/v1/file/list', requireAuthMiddleware, (req, res, next) => {
  handleRequestRestfully(req, res, next, {
    get: async () => {
      const user = WebServer.getUser(req);

      let requestedPath = req.query.path;
      if (typeof requestedPath !== 'string') {
        requestedPath = '/';
      }

      const requestedDirectory = user.getDefaultFileSystem().getFile(requestedPath);
      if (!(await requestedDirectory.exists())) {
        res
          .status(204)
          .type('application/json')
          .send({error: 'Requested path does not exist.'});
        return;
      }

      if (!(await requestedDirectory.isDirectory())) {
        res
          .status(400)
          .type('application/json')
          .send({error: 'Requested path is not a directory.'});
        return;
      }

      const userFiles = await requestedDirectory.getFiles();
      const directoryNames: string[] = [];

      const files: { name: string, mimeType?: string, isDirectory: boolean }[] = [];
      for (const file of userFiles) {
        const isDirectory = await file.isDirectory();
        if (isDirectory) {
          directoryNames.push(file.getName());
        }

        files.push({
          name: file.getName(),
          mimeType: isDirectory ? undefined : (await file.getMimeType() ?? undefined),
          isDirectory: isDirectory
        });
      }

      files.sort((a, b) => {
        if (directoryNames.includes(a.name) && !directoryNames.includes(b.name)) {
          return -1;
        }
        if (!directoryNames.includes(a.name) && directoryNames.includes(b.name)) {
          return 1;
        }
        return getFileNameCollator().compare(a.name, b.name);
      });

      res
        .status(200)
        .type('application/json')
        .send({
          path: requestedDirectory.getPath(),
          files
        });
    }
  });
});

apiRouter.use('/v1/file/get', requireAuthMiddleware, (req, res, next) => {
  handleRequestRestfully(req, res, next, {
    get: async () => {
      const user = WebServer.getUser(req);

      let requestedPath = req.query.path;
      if (typeof requestedPath !== 'string') {
        requestedPath = '/';
      }

      const requestedFile = user.getDefaultFileSystem().getFile(requestedPath);
      if (!(await requestedFile.exists())) {
        res
          .status(204)
          .type('application/json')
          .send();
        return;
      }
      if (await requestedFile.isDirectory()) {
        res
          .status(400)
          .type('application/json')
          .send({error: 'Requested path is a directory.'});
        return;
      }

      await Utils.sendFileRespectingRequestedRange(req, res, next, requestedFile, await requestedFile.getMimeType() ?? 'application/octet-stream');
    }
  });
});

apiRouter.use('/', (req, res, next) => {
  handleRequestRestfully(req, res, next, {
    get: () => {
      res
        .status(404)
        .type('application/json')
        .send({error: 'Unknown API endpoint'});
    }
  });
});
