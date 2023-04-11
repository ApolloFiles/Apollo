import express from 'express';
import WebServer from '../webserver/WebServer';
import { createWatchRouter } from './watch/WatchRouter';

export function createMediaRouter(webserver:WebServer): express.Router {
  const router = express.Router();

  router.use('/watch', createWatchRouter(webserver));

  return router;
}
