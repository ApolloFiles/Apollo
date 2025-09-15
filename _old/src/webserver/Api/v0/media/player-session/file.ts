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

  const currentMedia = playerSession.getCurrentMedia();
  if (currentMedia != null) {
    res.locals.timings?.startNext('rewrite-hls-audio-stream-names');

    const liveTranscodeManifestPathOnHost = Path.join(playerSession.tmpDir.publicSubDirPath, currentMedia.relativePublicPathToHlsManifest);
    if (requestedFilePathOnHost === liveTranscodeManifestPathOnHost) {
      let liveTranscodeManifest = await Fs.promises.readFile(liveTranscodeManifestPathOnHost, 'utf-8');

      const audioStreamPrefix = `#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="group_audio",NAME=`;
      for (const [streamName, displayName] of currentMedia.audioStreamNames.entries()) {
        const currentSubstring = `${audioStreamPrefix}${JSON.stringify(streamName)},`;
        const newSubstring = `${audioStreamPrefix}${JSON.stringify(displayName)},`;

        liveTranscodeManifest = liveTranscodeManifest.replace(currentSubstring, newSubstring);
      }

      res
        .status(200)
        .type('application/vnd.apple.mpegurl')
        .send(liveTranscodeManifest);
      return;
    }
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
