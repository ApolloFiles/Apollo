import { handleRequestRestfully } from '@spraxdev/node-commons';
import express from 'express';
import Http2 from 'node:http2';
import { container } from 'tsyringe';
import { getConfig } from '../../../../Constants';
import PlayerSession from '../../../../media/video-player/player-session/PlayerSession';
import PlayerSessionStorage from '../../../../media/video-player/player-session/PlayerSessionStorage';
import WebServer from '../../../WebServer';
import { handleChangeMedia } from './player-session/change-media';
import { handleGetPublicFile } from './player-session/file';
import { handleInfo } from './player-session/info';
import { handlePlaybackStatus } from './player-session/playback-status';
import { handleStartWatching } from './player-session/start-watching';
import { handleGetVideoSeekThumbnails } from './player-session/video-seek-thumbnails';

export const playerSessionApiRouter = express.Router();
const playerSessionStorage = container.resolve(PlayerSessionStorage);

function findPlayerSessionByQueryParamOrSessionCookie(req: express.Request, res: express.Response): PlayerSession | null {
  const loggedInUser = req.user;
  if (loggedInUser == null) {
    res
      .status(401)
      .type('text/plain')
      .send('Support for Anonymous users is planned, but not ready yet. You have to login for now.');
    return null;
  }

  const inputSessionId = req.query.session;
  if (inputSessionId == null || inputSessionId === '') {
    return playerSessionStorage.findOrCreateBySessionCookie(loggedInUser, req.session.id);
  }

  if (typeof inputSessionId !== 'string') {
    res
      .status(400)
      .type('text/plain')
      .send('Invalid session ID format');
    return null;
  }

  const playerSession = playerSessionStorage.findById(inputSessionId);
  if (playerSession == null || !playerSession.checkAccessForUser(loggedInUser)) {
    res
      .status(404)
      .type('text/plain')
      .send('Player session not found or you do not have access to it');
    return null;
  }

  return playerSession;
}

function findPlayerSessionFromPath(req: express.Request, res: express.Response): PlayerSession | null {
  if (!('sessionId' in req.params)) {
    throw new Error(`Route does not seem to have a sessionId parameter`);
  }

  const playerSession = playerSessionStorage.findById(req.params.sessionId);
  if (playerSession == null || !playerSession.checkAccessForUser(WebServer.getUser(req))) {
    res
      .status(404)
      .type('text/plain')
      .send('Player session not found or you do not have access to it');
    return null;
  }

  return playerSession;
}

playerSessionApiRouter.use('/join', (req, res, next) => {
  handleRequestRestfully(req, res, next, {
    get: () => {
      const loggedInUser = WebServer.getUser(req);
      const joinTokenInput = req.query.token;

      if (typeof joinTokenInput !== 'string' || joinTokenInput.trim() === '') {
        res
          .status(400)
          .type('text/plain')
          .send('Invalid or missing join token');
        return;
      }

      const playerSession = playerSessionStorage.findByJoinToken(joinTokenInput);
      if (playerSession == null) {
        res
          .status(404)
          .type('text/plain')
          .send('Player session not found or join token is invalid');
        return;
      }

      playerSession.addParticipant(loggedInUser);
      res.redirect(Http2.constants.HTTP_STATUS_TEMPORARY_REDIRECT, '/media-new/watch?session=' + encodeURIComponent(playerSession.id));
    },
  });
});

playerSessionApiRouter.use('/start-watching', (req, res, next) => {
  handleRequestRestfully(req, res, next, {
    get: () => {
      const playerSession = findPlayerSessionByQueryParamOrSessionCookie(req, res);
      if (playerSession == null) {
        return;
      }

      return handleStartWatching(req, res, playerSession);
    },
  });
});

playerSessionApiRouter.use('/info', (req, res, next) => {
  handleRequestRestfully(req, res, next, {
    get: () => {
      const playerSession = findPlayerSessionByQueryParamOrSessionCookie(req, res);
      if (playerSession == null) {
        return;
      }

      return handleInfo(req, res, playerSession);
    },
  });
});

playerSessionApiRouter.use('/:sessionId/playback-status', (req, res, next) => {
  handleRequestRestfully(req, res, next, {
    get: () => {
      const playerSession = findPlayerSessionFromPath(req, res);
      if (playerSession == null) {
        return;
      }

      return handlePlaybackStatus(req, res, playerSession);
    },
  });
});

playerSessionApiRouter.use('/:sessionId/change-media', express.json(), (req, res, next) => {
  handleRequestRestfully(req, res, next, {
    post: () => {
      const playerSession = findPlayerSessionFromPath(req, res);
      if (playerSession == null) {
        return;
      }

      return handleChangeMedia(req, res, playerSession);
    },
  });
});

playerSessionApiRouter.use('/:sessionId/file/', (req, res, next) => {
  handleRequestRestfully(req, res, next, {
    get: () => {
      const playerSession = findPlayerSessionFromPath(req, res);
      if (playerSession == null) {
        return;
      }

      return handleGetPublicFile(req, res, playerSession);
    },
  });
});

playerSessionApiRouter.use('/:sessionId/video-seek-thumbnails', (req, res, next) => {
  handleRequestRestfully(req, res, next, {
    get: () => {
      const playerSession = findPlayerSessionFromPath(req, res);
      if (playerSession == null) {
        return;
      }

      return handleGetVideoSeekThumbnails(req, res, playerSession);
    },
  });
});

playerSessionApiRouter.use('/:sessionId/regenerate-join-token', (req, res, next) => {
  handleRequestRestfully(req, res, next, {
    post: () => {
      const loggedInUser = WebServer.getUser(req);

      const playerSession = findPlayerSessionFromPath(req, res);
      if (playerSession?.owner.id !== loggedInUser.id) {
        res
          .status(403)
          .type('text/plain')
          .send('Session not found or you are not the owner of this session');
        return;
      }
      const joinToken = playerSession.regenerateJoinToken();

      res
        .status(200)
        .type('application/json')
        .send({
          shareUrl: getConfig().data.baseUrl + `/api/v0/media/player-session/join?token=${encodeURIComponent(joinToken.token)}`,
          joinToken,
        } satisfies RegenerateJoinTokenResponse);
    },
  });
});

export type RegenerateJoinTokenResponse = {
  shareUrl: string,
  joinToken: {
    token: string,
    expiresInSeconds: number,
  };
}
