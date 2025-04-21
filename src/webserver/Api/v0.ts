import { handleRequestRestfully } from '@spraxdev/node-commons';
import express from 'express';
import { mediaApiRouter } from './v0/media';

export const v0ApiRouter = express.Router();

v0ApiRouter.use('/media', mediaApiRouter);

v0ApiRouter.use('/', (req, res, next) => {
  handleRequestRestfully(req, res, next, {
    get: () => {
      res
        .status(404)
        .type('application/json')
        .send({ error: 'Unknown API endpoint' });
    },
  });
});
