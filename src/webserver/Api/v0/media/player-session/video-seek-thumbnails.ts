import type express from 'express';
import { container } from 'tsyringe';
import PlayerSession from '../../../../../media/video-player/player-session/PlayerSession';
import LocalFile from '../../../../../user/files/local/LocalFile';
import VideoSeekThumbnailControllerHelper from '../VideoSeekThumbnailControllerHelper';

const videoSeekThumbnailControllerHelper = container.resolve(VideoSeekThumbnailControllerHelper);

export async function handleGetVideoSeekThumbnails(req: express.Request, res: express.Response, playerSession: PlayerSession): Promise<void> {
  res.locals.timings?.startNext('handle-request');

  const thumbnailIndex = videoSeekThumbnailControllerHelper.parseRequestedThumbnailIndex(req, res);
  if (thumbnailIndex == null) {
    return;
  }

  const currentFile = playerSession.getCurrentFile();
  if (currentFile == null) {
    res
      .status(404)
      .type('application/json')
      .send({ error: 'Cannot provide video seek thumbnails for current media (nothing playing?)' });
    return;
  }

  if (!(currentFile instanceof LocalFile)) {
    res
      .status(501)
      .type('application/json')
      .send({ error: `The requested file is not stored in the local file system (Missing implementation)` });
    return;
  }

  await videoSeekThumbnailControllerHelper.handleResponse(
    req,
    res,
    { file: currentFile, thumbnailIndex },
    false,
  );
}
