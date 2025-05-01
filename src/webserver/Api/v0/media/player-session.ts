import { handleRequestRestfully } from '@spraxdev/node-commons';
import express from 'express';
import { container } from 'tsyringe';
import PlayerSessionStorage from '../../../../media/video-player/player-session/PlayerSessionStorage';
import WebServer from '../../../WebServer';
import { handleGetPublicFile } from './player-session/file';
import { handleStartPlayback } from './player-session/start-playback';
import { handleGetVideoSeekThumbnails } from './player-session/video-seek-thumbnails';

export const playerSessionApiRouter = express.Router();

const playerSessionStorage = container.resolve(PlayerSessionStorage);

playerSessionApiRouter.use('/video-seek-thumbnails', (req, res, next) => {
  handleRequestRestfully(req, res, next, {
    get: () => {
      const playerSession = playerSessionStorage.findOrCreateBySessionCookie(WebServer.getUser(req), req.session.id);
      return handleGetVideoSeekThumbnails(req, res, playerSession);
    },
  });
});

playerSessionApiRouter.use('/start-playback', express.json(), (req, res, next) => {
  handleRequestRestfully(req, res, next, {
    post: () => {
      const playerSession = playerSessionStorage.findOrCreateBySessionCookie(WebServer.getUser(req), req.session.id);
      return handleStartPlayback(req, res, playerSession);
    },
  });
});

playerSessionApiRouter.use('/file/', (req, res, next) => {
  handleRequestRestfully(req, res, next, {
    get: () => {
      const playerSession = playerSessionStorage.findOrCreateBySessionCookie(WebServer.getUser(req), req.session.id);
      return handleGetPublicFile(req, res, playerSession);
    },
  });
});
