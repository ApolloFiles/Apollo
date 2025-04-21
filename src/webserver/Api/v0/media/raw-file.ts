import type express from 'express';
import ApolloUser from '../../../../user/ApolloUser';
import ApolloFileUrl from '../../../../user/files/url/ApolloFileUrl';
import InvalidApolloUrlError from '../../../../user/files/url/InvalidApolloUrlError';
import VirtualFile from '../../../../user/files/VirtualFile';
import Utils from '../../../../Utils';
import WebServer from '../../../WebServer';

export async function handleGetRawVideoFile(req: express.Request, res: express.Response): Promise<void> {
  const fileInput = parseUserInputFilePath(res, req.query.file);
  if (fileInput == null) {
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

  await Utils.sendFileRespectingRequestedRange(req, res, requestedFile, await requestedFile.getMimeType() ?? 'text/plain', false);
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

async function determineRequestedFile(res: express.Response, user: ApolloUser, fileUrl: ApolloFileUrl): Promise<VirtualFile | null> {
  const requestedFile = user.getFileByUrl(fileUrl);
  if (!(await requestedFile.exists())) {
    res
      .status(404)
      .type('application/json')
      .send({ error: `The requested file does not exist` });
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
