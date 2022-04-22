import express from 'express';
import Utils from '../../Utils';
import { filesHandleGet } from './FilesGetHandler';
import { filesHandlePost } from './FilesPostHandler';

export function createFilesRouter(frontendType: 'browse' | 'trash'): express.Router {
  const router = express.Router();
  router.use('/', (req, res, next) => {
    Utils.restful(req, res, next,
        {
          get: filesHandleGet(req, res, frontendType),
          post: filesHandlePost(req, res, frontendType)
        });
  });

  return router;
}
