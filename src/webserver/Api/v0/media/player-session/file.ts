import type express from 'express';
import Fs from 'node:fs';
import Path from 'node:path';
import { getFileTypeUtils } from '../../../../../Constants';
import PlayerSession from '../../../../../media/video-player/player-session/PlayerSession';
import Utils from '../../../../../Utils';

export async function handleGetPublicFile(req: express.Request, res: express.Response, playerSession: PlayerSession): Promise<void> {
  const requestedFilePathOnHost = Path.join(playerSession.tmpDir.publicSubDirPath, req.path);
  if (!requestedFilePathOnHost.startsWith(playerSession.tmpDir.publicSubDirPath)) {
    res
      .status(403)
      .send('Forbidden');
    return;
  }

  if (!(await fileExists(requestedFilePathOnHost))) {
    res
      .status(404)
      .send('Requested file not found');
    return;
  }

  res.locals.timings?.startNext('mime-type-detection');
  const mimeType = await getFileTypeUtils().getMimeTypeTrustExtension(requestedFilePathOnHost);
  res.locals.timings?.startNext('respond');
  await Utils.sendFileRespectingRequestedRange(req, res, requestedFilePathOnHost, mimeType ?? 'application/octet-stream');
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await Fs.promises.stat(path);
    return true;
  } catch (err: any) {
    if (err instanceof Error && (err as any).code === 'ENOENT') {
      return false;
    }
    throw err;
  }
}
