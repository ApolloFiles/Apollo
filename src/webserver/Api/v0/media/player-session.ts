import { handleRequestRestfully } from '@spraxdev/node-commons';
import express from 'express';
import { container } from 'tsyringe';
import PlayerSessionStorage from '../../../../media/video-player/player-session/PlayerSessionStorage';
import WebServer from '../../../WebServer';
import { handleChangeMedia } from './player-session/change-media';
import { handleGetPublicFile } from './player-session/file';
import { handlePlaybackStatus } from './player-session/playback-status';
import { handleStartWatching } from './player-session/start-watching';
import { handleGetVideoSeekThumbnails } from './player-session/video-seek-thumbnails';

export const playerSessionApiRouter = express.Router();

const playerSessionStorage = container.resolve(PlayerSessionStorage);

playerSessionApiRouter.use('/playback-status', (req, res, next) => {
  handleRequestRestfully(req, res, next, {
    get: () => {
      const playerSession = playerSessionStorage.findOrCreateBySessionCookie(WebServer.getUser(req), req.session.id);
      return handlePlaybackStatus(req, res, playerSession);
    },
  });
});

playerSessionApiRouter.use('/start-watching', (req, res, next) => {
  handleRequestRestfully(req, res, next, {
    get: () => {
      const playerSession = playerSessionStorage.findOrCreateBySessionCookie(WebServer.getUser(req), req.session.id);
      return handleStartWatching(req, res, playerSession);
    },
  });
});

playerSessionApiRouter.use('/change-media', express.json(), (req, res, next) => {
  handleRequestRestfully(req, res, next, {
    post: () => {
      const playerSession = playerSessionStorage.findOrCreateBySessionCookie(WebServer.getUser(req), req.session.id);
      return handleChangeMedia(req, res, playerSession);
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

playerSessionApiRouter.use('/video-seek-thumbnails', (req, res, next) => {
  handleRequestRestfully(req, res, next, {
    get: () => {
      const playerSession = playerSessionStorage.findOrCreateBySessionCookie(WebServer.getUser(req), req.session.id);
      return handleGetVideoSeekThumbnails(req, res, playerSession);
    },
  });
});
