import express from 'express';
import WebServer from '../webserver/WebServer';
import { createWatchRouter } from './watch/WatchRouter';

export function createMediaRouter(webserver: WebServer, sessionMiddleware: express.RequestHandler): express.Router {
  const router = express.Router();

  router.use('/watch', createWatchRouter(webserver, sessionMiddleware));

  return router;
}
