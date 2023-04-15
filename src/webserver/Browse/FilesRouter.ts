import { handleRequestRestfully } from '@spraxdev/node-commons';
import express from 'express';
import { filesHandleGet } from './FilesGetHandler';
import { filesHandlePost } from './FilesPostHandler';

export function createFilesRouter(frontendType: 'browse' | 'trash'): express.Router {
  const router = express.Router();

  router.use('/', (req, res, next) => {
    handleRequestRestfully(req, res, next,
        {
          get: filesHandleGet(req, res, next, frontendType),
          post: filesHandlePost(req, res, frontendType)
        });
  });

  return router;
}
