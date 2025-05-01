import type express from 'express';
import { singleton } from 'tsyringe';
import SeekThumbnailProvider from '../../../../media/video-player/seek-thumbnails/SeekThumbnailProvider';
import ApolloUser from '../../../../user/ApolloUser';
import LocalFile from '../../../../user/files/local/LocalFile';
import ApolloFileUrl from '../../../../user/files/url/ApolloFileUrl';
import InvalidApolloUrlError from '../../../../user/files/url/InvalidApolloUrlError';
import WebServer from '../../../WebServer';

type RequestInputs = {
  file: LocalFile,
  thumbnailIndex: number
}

@singleton()
export default class VideoSeekThumbnailControllerHelper {
  private readonly requestLocks = new Map<string, Promise<void>>();

  constructor(
    private readonly seekThumbnailProvider: SeekThumbnailProvider,
  ) {
  }

  // TODO: Maybe send Status 202 Accepted after a timeout, if generating takes too long (20+ seconds?)
  async handleResponse(
    req: express.Request,
    res: express.Response,
    inputs: RequestInputs,
  ): Promise<void> {
    // TODO: Refactor
    if (req.headers['if-modified-since'] != null && Date.parse(req.headers['if-modified-since']) >= Date.parse((await inputs.file.stat()).mtime.toISOString())) {
      res
        .status(304)
        .send();
      return;
    }

    let responseBody: string | Buffer;

    res.locals.timings?.startNext('acquire-lock');
    const releaseGenerationLock = await this.acquireGenerationLock(inputs.file.toUrl()); // acquire lock before any further async operations
    res.locals.timings?.startNext('get-or-generate-seek-thumbnails');
    try {
      if (inputs.thumbnailIndex === -1) {
        const parsedOriginalRequestUrl = new URL(req.originalUrl, 'http://localhost');

        responseBody = await this.seekThumbnailProvider.provideWebVtt(
          inputs.file,
          (thumbnailIndex) => {
            parsedOriginalRequestUrl.searchParams.set('index', thumbnailIndex.toString());
            return parsedOriginalRequestUrl.pathname + parsedOriginalRequestUrl.search;
          },
        );
      } else {
        const thumbnailBytes = await this.seekThumbnailProvider.provideThumbnailImage(inputs.file, inputs.thumbnailIndex);
        if (thumbnailBytes == null) {
          res
            .status(404)
            .type('application/json')
            .send({ error: 'The requested thumbnail file does not exist' });
          return;
        }

        responseBody = thumbnailBytes;
      }
    } finally {
      releaseGenerationLock();
    }

    res.locals.timings?.startNext('respond');
    res
      .status(200)
      .type(inputs.thumbnailIndex === -1 ? 'text/vtt' : 'image/jpeg')
      .setHeader('Cache-Control', 'private, no-cache')
      .setHeader('Last-Modified', (await inputs.file.stat()).mtime.toUTCString())
      .send(responseBody);
  }

  parseRequestedThumbnailIndex(req: express.Request, res: express.Response): number | null {
    const requestedFrameIndex = this.parseUserInputFrameIndex(res, req.query.index);
    if (requestedFrameIndex == null) {
      return null;
    }

    return requestedFrameIndex;
  }

  async parseRequestedFile(req: express.Request, res: express.Response, input: unknown): Promise<LocalFile | null> {
    const fileInput = this.parseUserInputFilePath(res, input);
    if (fileInput == null) {
      return null;
    }

    const apolloFileUrl = this.parseApolloFileUrl(res, fileInput);
    if (apolloFileUrl == null) {
      return null;
    }

    const requestedFile = await this.determineRequestedFile(res, WebServer.getUser(req), apolloFileUrl);
    if (requestedFile == null) {
      return null;
    }

    return requestedFile;
  }

  async parseRequestFileAndThumbnailIndex(req: express.Request, res: express.Response): Promise<RequestInputs | null> {
    const thumbnailIndex = this.parseRequestedThumbnailIndex(req, res);
    if (thumbnailIndex == null) {
      return null;
    }

    const requestedFile = await this.parseRequestedFile(req, res, req.query.file);
    if (requestedFile == null) {
      return null;
    }

    return {
      file: requestedFile,
      thumbnailIndex,
    };
  }

  async acquireGenerationLock(apolloFileUrl: ApolloFileUrl): Promise<() => void> {
    await this.requestLocks.get(apolloFileUrl.toString());

    // TODO: Use `Promise.withResolvers()` when available in future Node.js versions
    return new Promise((resolve) => {
      this.requestLocks.set(apolloFileUrl.toString(), new Promise(releaseGenerationLock => {
        resolve(() => {
          this.requestLocks.delete(apolloFileUrl.toString());
          releaseGenerationLock();
        });
      }));
    });
  }

  async determineRequestedFile(res: express.Response, user: ApolloUser, fileUrl: ApolloFileUrl): Promise<LocalFile | null> {
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

  private parseApolloFileUrl(res: express.Response, userInput: string): ApolloFileUrl | null {
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

  private parseUserInputFilePath(res: express.Response, userInput: unknown): string | null {
    if (typeof userInput !== 'string' || userInput.trim().length === 0) {
      res
        .status(400)
        .type('application/json')
        .send({ error: `Parameter 'file' is missing or invalid` });
      return null;
    }

    return userInput;
  }

  private parseUserInputFrameIndex(res: express.Response, userInput: unknown): number | null {
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
}
