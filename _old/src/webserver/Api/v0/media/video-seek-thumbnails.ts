import type express from 'express';
import { container } from 'tsyringe';
import VideoSeekThumbnailControllerHelper from './VideoSeekThumbnailControllerHelper';

const videoSeekThumbnailControllerHelper = container.resolve(VideoSeekThumbnailControllerHelper);

export async function handleGetVideoSeekThumbnails(req: express.Request, res: express.Response): Promise<void> {
  const inputs = await videoSeekThumbnailControllerHelper.parseRequestFileAndThumbnailIndex(req, res);
  if (inputs == null) {
    return;
  }

  await videoSeekThumbnailControllerHelper.handleResponse(req, res, inputs, true);
}
