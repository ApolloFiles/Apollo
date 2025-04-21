import type express from 'express';
import Fs from 'node:fs';
import FileSystemBasedCache from '../../../../cache/FileSystemBasedCache';
import WebVttKeyframeGenerator from '../../../../media/watch/WebVttKeyframeGenerator';
import ApolloUser from '../../../../user/ApolloUser';
import LocalFile from '../../../../user/files/local/LocalFile';
import ApolloFileUrl from '../../../../user/files/url/ApolloFileUrl';
import InvalidApolloUrlError from '../../../../user/files/url/InvalidApolloUrlError';
import WebServer from '../../../WebServer';

const cache = FileSystemBasedCache.getInstance();
const requestLocks = new Map<string, Promise<void>>();

// TODO: have a dedicated class/service that handles generation and caching
// TODO: Maybe send Status 202 Accepted after a timeout, if generating takes too long (20+ seconds?)
export async function handleGetVideoSeekThumbnails(req: express.Request, res: express.Response): Promise<void> {
  const fileInput = parseUserInputFilePath(res, req.query.file);
  if (fileInput == null) {
    return;
  }
  const requestedFrameIndex = parseUserInputFrameIndex(res, req.query.frame);
  if (requestedFrameIndex == null) {
    return;
  }

  const loggedInUser = WebServer.getUser(req);

  const apolloFileUrl = parseApolloFileUrl(res, fileInput);
  if (apolloFileUrl == null) {
    return;
  }

  const requestedFile = await determineRequestedFile(res, loggedInUser, apolloFileUrl);
  if (requestedFile == null) {
    return;
  }

  const cacheKeyPrefix = requestedFile.toUrl() + ';' + (await requestedFile.stat()).mtimeMs + ';';
  const cacheKey = cacheKeyPrefix + (requestedFrameIndex === -1 ? 'vtt' : requestedFrameIndex);

  const releaseGenerationLock = await acquireGenerationLock(apolloFileUrl); // acquire lock before any further async operations
  try {
    if (!(await cache.userAssociatedCachedFileExists(loggedInUser, cacheKey))) {
      if (requestedFrameIndex !== -1 && (await cache.userAssociatedCachedFileExists(loggedInUser, cacheKeyPrefix + 'vtt'))) {
        res
          .status(404)
          .type('application/json')
          .send({ error: 'The requested keyframe file does not exist' });
        return;
      }

      await generateAndCacheSeekThumbnails(req, requestedFile, cacheKeyPrefix);
    }
  } finally {
    releaseGenerationLock();
  }

  const cachedResponse = await cache.getUserAssociatedCachedFile(loggedInUser, cacheKey);
  if (cachedResponse == null) {
    throw new Error('Cached file does not exist');
  }

  // TODO: Refactor
  if (req.headers['if-modified-since'] != null && Date.parse(req.headers['if-modified-since']) >= Date.parse((await requestedFile.stat()).mtime.toISOString())) {
    res
      .status(304)
      .send();
    return;
  }

  res
    .status(200)
    .type(requestedFrameIndex === -1 ? 'text/vtt' : 'image/jpeg')
    .setHeader('Cache-Control', 'private, no-cache')
    .setHeader('Last-Modified', (await requestedFile.stat()).mtime.toUTCString())
    .send(cachedResponse);
}

async function generateAndCacheSeekThumbnails(req: express.Request, file: LocalFile, cacheKeyPrefix: string): Promise<void> {
  const fileOwner = file.fileSystem.owner;
  const tmpDir = await fileOwner.getTmpFileSystem().createTmpDir('api-v0-media-video-seek-thumbnails-');

  const parsedOriginalRequestUrl = new URL(req.originalUrl, 'http://localhost');
  const generatedKeyframes = await new WebVttKeyframeGenerator().generate(
    file.getAbsolutePathOnHost(),
    tmpDir.getAbsolutePathOnHost(),
    (frameIndex) => {
      parsedOriginalRequestUrl.searchParams.set('frame', frameIndex.toString());
      return parsedOriginalRequestUrl.pathname + parsedOriginalRequestUrl.search;
    },
  );

  await cache.setUserAssociatedCachedFile(fileOwner, cacheKeyPrefix + 'vtt', await Fs.promises.readFile(generatedKeyframes.vttFile));
  for (let frameIndex = 0; frameIndex < generatedKeyframes.frameFiles.length; ++frameIndex) {
    const frameFile = generatedKeyframes.frameFiles[frameIndex];
    await cache.setUserAssociatedCachedFile(fileOwner, cacheKeyPrefix + frameIndex, await Fs.promises.readFile(frameFile));
  }
}

async function acquireGenerationLock(apolloFileUrl: ApolloFileUrl): Promise<() => void> {
  await requestLocks.get(apolloFileUrl.toString());

  // TODO: Use `Promise.withResolvers()` when available in future Node.js versions
  return new Promise((resolve) => {
    requestLocks.set(apolloFileUrl.toString(), new Promise(releaseGenerationLock => {
      resolve(() => {
        requestLocks.delete(apolloFileUrl.toString());
        releaseGenerationLock();
      });
    }));
  });
}

function parseApolloFileUrl(res: express.Response, userInput: string): ApolloFileUrl | null {
  try {
    return new ApolloFileUrl(userInput);
  } catch (err: any) {
    if (err instanceof InvalidApolloUrlError) {
      res
        .status(400)
        .type('application/json')
        .send({ error: `Parameter 'file' is not a valid ApolloFileUrl` });
      return null;
    }

    throw err;
  }
}

async function determineRequestedFile(res: express.Response, user: ApolloUser, fileUrl: ApolloFileUrl): Promise<LocalFile | null> {
  const requestedFile = user.getFileByUrl(fileUrl);
  if (!(await requestedFile.exists())) {
    res
      .status(404)
      .type('application/json')
      .send({ error: `The requested file does not exist` });
    return null;
  }
  if (!(requestedFile instanceof LocalFile)) {
    res
      .status(501)
      .type('application/json')
      .send({ error: `The requested file is not stored in the local file system (Missing implementation)` });
    return null;
  }

  return requestedFile;
}

function parseUserInputFilePath(res: express.Response, userInput: unknown): string | null {
  if (typeof userInput !== 'string' || userInput.trim().length === 0) {
    res
      .status(400)
      .type('application/json')
      .send({ error: `Parameter 'file' is missing or invalid` });
    return null;
  }

  return userInput;
}

function parseUserInputFrameIndex(res: express.Response, userInput: unknown): number | null {
  if (userInput != null && typeof userInput !== 'string') {
    res
      .status(400)
      .type('application/json')
      .send({ error: `Parameter 'frame' is invalid` });
    return null;
  }
  if (userInput != null && !/^\d+$/.test(userInput)) {
    res
      .status(400)
      .type('application/json')
      .send({ error: `Parameter 'frame' has an invalid value` });
    return null;
  }

  return parseInt(userInput ?? '-1', 10);
}
