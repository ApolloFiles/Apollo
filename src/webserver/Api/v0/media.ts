import { handleRequestRestfully } from '@spraxdev/node-commons';
import express from 'express';
import { handleGetRawVideoFile } from './media/raw-file';
import { handleGetVideoSeekThumbnails } from './media/video-seek-thumbnails';

export const mediaApiRouter = express.Router();

mediaApiRouter.use('/video-seek-thumbnails', (req, res, next) => {
  handleRequestRestfully(req, res, next, {
    get: () => handleGetVideoSeekThumbnails(req, res),
  });
});

mediaApiRouter.use('/raw-file', (req, res, next) => {
  handleRequestRestfully(req, res, next, {
    get: () => handleGetRawVideoFile(req, res),
  });
});
