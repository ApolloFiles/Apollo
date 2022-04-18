import express from 'express';
import Utils from '../../Utils';
import { filesHandleGet } from './FilesGetHandler';
import { filesHandlePost } from './FilesPostHandler';

export function createFilesRouter(type: 'browse' | 'trash'): express.Router {
  const router = express.Router();
  router.use('/', (req, res, next) => {
    Utils.restful(req, res, next,
        {
          get: filesHandleGet(req, res, type),
          post: filesHandlePost(req, res, type)
        });
  });

  return router;
}
