import type { FastifyReply, FastifyRequest } from 'fastify';
import { container, singleton } from 'tsyringe';
import FileProvider from '../../../../../../files/FileProvider.js';
import LocalFile from '../../../../../../files/local/LocalFile.js';
import ApolloFileURI from '../../../../../../uri/ApolloFileURI.js';
import type ApolloUser from '../../../../../../user/ApolloUser.js';
import type PlayerSession from '../player-session/PlayerSession.js';

type RequestInputs = {
  file: LocalFile,
  thumbnailIndex: number
}

@singleton()
export default class VideoSeekThumbnailControllerHelper {
  private readonly requestLocks = new Map<string, Promise<void>>();

  constructor(
    //    private readonly seekThumbnailProvider: SeekThumbnailProvider,
  ) {
  }

  // TODO: Maybe send Status 202 Accepted after a timeout, if generating takes too long (20+ seconds?)
//  async handleResponse(
//    req: FastifyRequest,
//    res: FastifyReply,
//    inputs: RequestInputs,
//    useIfModifiedSinceHeader: boolean,
//  ): Promise<void> {
//    // TODO: Refactor
//    if (useIfModifiedSinceHeader && req.headers['if-modified-since'] != null && Date.parse(req.headers['if-modified-since']) >= Date.parse((await inputs.file.stat()).mtime.toISOString())) {
//      res
//        .status(304)
//        .send();
//      return;
//    }
//
//    let responseBody: string | Buffer;
//
//    const releaseGenerationLock = await this.acquireGenerationLock(inputs.file.toUrl()); // acquire lock before any further async operations
//    try {
//      if (inputs.thumbnailIndex === -1) {
//        const parsedOriginalRequestUrl = new URL(req.originalUrl, 'http://localhost');
//
//        responseBody = await this.seekThumbnailProvider.provideWebVtt(
//          inputs.file,
//          (thumbnailIndex) => {
//            parsedOriginalRequestUrl.searchParams.set('index', thumbnailIndex.toString());
//            return parsedOriginalRequestUrl.pathname + parsedOriginalRequestUrl.search;
//          },
//        );
//      } else {
//        const thumbnailBytes = await this.seekThumbnailProvider.provideThumbnailImage(inputs.file, inputs.thumbnailIndex);
//        if (thumbnailBytes == null) {
//          res
//            .status(404)
//            .type('application/json')
//            .send({ error: 'The requested thumbnail file does not exist' });
//          return;
//        }
//
//        responseBody = thumbnailBytes;
//      }
//    } finally {
//      releaseGenerationLock();
//    }
//
//    res
//      .status(200)
//      .type(inputs.thumbnailIndex === -1 ? 'text/vtt' : 'image/jpeg')
//      .header('Cache-Control', 'private, no-cache');
//
//    if (useIfModifiedSinceHeader) {
//      res.header('Last-Modified', (await inputs.file.stat()).mtime.toUTCString());
//    }
//
//    res.send(responseBody);
//  }

  parseRequestedThumbnailIndex(req: FastifyRequest, res: FastifyReply): number | null {
    const requestedFrameIndex = this.parseUserInputFrameIndex(res, (req.query as any).index);
    if (requestedFrameIndex == null) {
      return null;
    }

    return requestedFrameIndex;
  }

  async parseRequestedFile(req: FastifyRequest, res: FastifyReply, input: unknown, loggedInUser: ApolloUser): Promise<LocalFile | null> {
    const fileInput = this.parseUserInputFilePath(res, input);
    if (fileInput == null) {
      return null;
    }

    const apolloFileUri = this.parseApolloFileUri(res, fileInput);
    if (apolloFileUri == null) {
      return null;
    }

    const requestedFile = await this.determineRequestedFile(res, loggedInUser, apolloFileUri);
    if (requestedFile == null) {
      return null;
    }

    return requestedFile;
  }

  async parseRequestFileAndThumbnailIndex(req: FastifyRequest, res: FastifyReply, loggedInUser: ApolloUser): Promise<RequestInputs | null> {
    const thumbnailIndex = this.parseRequestedThumbnailIndex(req, res);
    if (thumbnailIndex == null) {
      return null;
    }

    const requestedFile = await this.parseRequestedFile(req, res, (req.query as any).file, loggedInUser);
    if (requestedFile == null) {
      return null;
    }

    return {
      file: requestedFile,
      thumbnailIndex,
    };
  }

  async acquireStartPlaybackLockNonBlocking(playerSession: PlayerSession): Promise<false | (() => void)> {
    const existingLock = this.requestLocks.get(playerSession.id);
    if (existingLock !== undefined) {
      return false;
    }

    // TODO: Use `Promise.withResolvers()` when available in future Node.js versions
    return new Promise((resolve) => {
      this.requestLocks.set(playerSession.id, new Promise(releaseStartPlaybackLock => {
        resolve(() => {
          this.requestLocks.delete(playerSession.id);
          releaseStartPlaybackLock();
        });
      }));
    });
  }

  async determineRequestedFile(res: FastifyReply, user: ApolloUser, fileUri: ApolloFileURI): Promise<LocalFile | null> {
    const fileProvider = container.resolve(FileProvider);
    const requestedFile = await fileProvider.provideForUserByUri(user, fileUri);

    if (!(requestedFile instanceof LocalFile)) {
      res
        .status(501)
        .type('application/json')
        .send({ error: `The requested file is not stored in the local file system (Missing implementation)` });
      return null;
    }
    if (!(await requestedFile.exists())) {
      console.log({
        userId: fileUri.userId,
        fileSystemId: fileUri.fileSystemId,
        filePath: fileUri.filePath,
        absolutePathOnHost: requestedFile.getAbsolutePathOnHost(),
      });

      res
        .status(404)
        .type('application/json')
        .send({ error: `The requested file does not exist` });
      return null;
    }

    return requestedFile;
  }

  async acquireGenerationLock(apolloFileUri: ApolloFileURI): Promise<() => void> {
    await this.requestLocks.get(apolloFileUri.toString());

    // TODO: Use `Promise.withResolvers()` when available in future Node.js versions
    return new Promise((resolve) => {
      this.requestLocks.set(apolloFileUri.toString(), new Promise(releaseGenerationLock => {
        resolve(() => {
          this.requestLocks.delete(apolloFileUri.toString());
          releaseGenerationLock();
        });
      }));
    });
  }

  private parseApolloFileUri(res: FastifyReply, userInput: string): ApolloFileURI | null {
    try {
      return ApolloFileURI.parse(userInput);
    } catch (err: any) {
      res
        .status(400)
        .type('application/json')
        .send({ error: `Parameter 'file' is not a valid ApolloFileURI` });
      return null;
    }
  }

  private parseUserInputFilePath(res: FastifyReply, userInput: unknown): string | null {
    if (typeof userInput !== 'string' || userInput.trim().length === 0) {
      console.log({ userInput });

      res
        .status(400)
        .type('application/json')
        .send({ error: `Parameter 'file' is missing or invalid` });
      return null;
    }

    return userInput;
  }

  private parseUserInputFrameIndex(res: FastifyReply, userInput: unknown): number | null {
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
