import express from 'express';
import expressFileUpload from 'express-fileupload';
import Path from 'path';
import AbstractUser from '../../AbstractUser';
import IUserFile from '../../files/IUserFile';
import WebServer from '../WebServer';
import CreateFilePostActionHandler from './PostActionHandler/CreateFilePostActionHandler';
import FileSearchPostActionHandler from './PostActionHandler/FileSearchPostActionHandler';
import FileUploadPostActionHandler from './PostActionHandler/FileUploadPostActionHandler';
import IPostActionHandler from './PostActionHandler/IPostActionHandler';
import MoveToTrashPostActionHandler from './PostActionHandler/MoveToTrashPostActionHandler';
import RenamePostActionHandler from './PostActionHandler/RenamePostActionHandler';

const postActionHandlers: IPostActionHandler[] = [
  new CreateFilePostActionHandler(false),
  new CreateFilePostActionHandler(true),
  new MoveToTrashPostActionHandler(),
  new FileUploadPostActionHandler(),
  new FileSearchPostActionHandler(),
  new RenamePostActionHandler()
];

export function filesHandlePost(req: express.Request, res: express.Response, type: 'browse' | 'trash'): () => Promise<void> {
  return async () => {
    const user = WebServer.getUser(req);
    const fileSystem = user.getDefaultFileSystem();

    if (req.header('Content-Type') != 'multipart/form-data' &&
        !req.header('Content-Type')?.startsWith('multipart/form-data;') &&
        req.header('Content-Type') != 'application/x-www-form-urlencoded') {
      res.status(400)
          .type('text/plain')
          .send('Invalid Content-Type');
      return;
    }

    await WebServer.runMiddleware(req, res, express.urlencoded({parameterLimit: 3, extended: false}));
    if (req.header('Content-Type')?.indexOf('multipart/form-data') != -1) {
      await WebServer.runMiddleware(req, res, expressFileUpload({
        abortOnLimit: true,
        useTempFiles: true,
        tempFileDir: Path.join(user.getTmpFileSystem().getAbsolutePathOnHost(), 'uploads')
      }));
    }
    // await runMiddleware(req, res, express.json());

    const postAction = req.body.action;
    const postValue = req.body.value;
    const postNewValue = req.body.newValue;

    const filePath = postValue ? Path.join(decodeURI(req.path), postValue) : null;
    const file = filePath ? fileSystem.getFile(filePath) : null;

    for (const postActionHandler of postActionHandlers) {
      if (postActionHandler.getActionKey() == postAction) {
        await postActionHandler.handle(req, res, user, file, postValue, postNewValue);
        return;
      }
    }

    res.status(400)
        .type('text/plain')
        .send(`Action '${postAction}' is not supported`);
  };
}

async function handleActionFileUpload(req: express.Request, res: express.Response, user: AbstractUser, file: IUserFile | null, postValue: string): Promise<void> {
}
