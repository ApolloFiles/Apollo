import express from 'express';

let aliasRouter: express.Router;  // FIXME

export function createAliasRouter(): express.Router {
  if (aliasRouter != null) {
    throw new Error('AliasRouter already created');
  }

  aliasRouter = express.Router();
  // router.use('/', (req, res, next) => {
  //   handleRequestRestfully(req, res, next,
  //       {
  //         get: filesHandleGet(req, res, frontendType),
  //         post: filesHandlePost(req, res, frontendType)
  //       });
  // });

  return aliasRouter;
}

export function registerAliasHandler(token: string, handler: (req: express.Request, res: express.Response, next: express.NextFunction) => void) {
  aliasRouter.use(`/${token}`, handler);
}
