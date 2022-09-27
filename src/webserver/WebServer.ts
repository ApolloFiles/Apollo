import { StringUtils } from '@spraxdev/node-commons';
import express from 'express';
import expressSession from 'express-session';
import Fs from 'fs';
import * as Http from 'http';
import Path from 'path';
import SessionFileStore from 'session-file-store';
import AbstractUser from '../AbstractUser';
import { getAppConfigDir, getAppResourcesDir, getConfig } from '../Constants';
import { ServerTiming } from '../ServerTiming';
import UserStorage from '../UserStorage';
import Utils from '../Utils';
import { adminRouter } from './AdminRouter';
import { createAliasRouter } from './AliasRouter';
import { createFilesRouter } from './Browse/FilesRouter';
import { generateLoginRedirectUri, loginRouter } from './LoginRouter';

export default class WebServer {
  protected app: express.Application;
  protected server?: Http.Server;

  constructor() {
    this.app = express();

    this.app.disable('x-powered-by');
    this.app.set('trust proxy', getConfig().data.webserver.trustProxy);
    this.app.set('etag', false);

    this.app.use(ServerTiming.getExpressMiddleware(true /*!isProduction()*/));  // TODO: remove debug

    this.setupSessionMiddleware();

    this.app.use('/admin', WebServer.requireValidLogin, adminRouter);

    this.app.use('/browse', WebServer.requireValidLogin, createFilesRouter('browse'));
    this.app.use('/trash', WebServer.requireValidLogin, createFilesRouter('trash'));
    this.app.use('/alias', /*WebServer.requireValidLogin, FIXME */ createAliasRouter());
    this.app.use('/login', loginRouter);
    this.app.use('/logout', (req: express.Request, res, next) => {
      // Store cookie properties for manual deletion
      const cookie = req.session.cookie;
      cookie.maxAge = 0;

      // Destroy session
      req.session.destroy((err) => {
        if (err) return next(err);

        // Delete cookie
        res.clearCookie('sessID', {
          domain: cookie.domain,
          httpOnly: cookie.httpOnly,
          maxAge: 0,
          path: cookie.path,
          sameSite: cookie.sameSite,
          secure: cookie.secure == 'auto' ? req.secure : cookie.secure
        });

        res.redirect('/');
      });
    });

    this.app.all('/', (req: express.Request, res, next) => {
      Utils.restful(req, res, next, {
        get: () => {
          res.redirect('/browse/');
        }
      });
    });

    const staticRouteOptions = {index: false, etag: false, redirect: false};
    this.app.use('/', express.static(Path.join(getAppResourcesDir(), 'public', 'static'), staticRouteOptions));
    this.app.use('/favicon.ico', express.static(Path.join(getAppResourcesDir(), 'public', 'static', 'favicon', 'favicon.ico'), staticRouteOptions));
    this.app.use('/node_modules', express.static(Path.join(getAppResourcesDir(), '..', 'node_modules'), staticRouteOptions));

    this.setupErrorHandling();
  }

  async listen(port: number, host?: string): Promise<void> {
    return new Promise((resolve) => {
      this.shutdown();

      this.server = this.app.listen(port, host ?? '127.0.0.1', () => resolve());
    });
  }

  async shutdown(): Promise<void> {
    if (this.server == null) {
      return;
    }

    return new Promise((resolve) => {
      this.server?.close(() => {
        this.server = undefined;
        resolve();
      });
    });
  }

  private setupSessionMiddleware(): void {
    const sessionDirectory = Path.join(getAppConfigDir(), 'sessions');
    Fs.mkdirSync(sessionDirectory, {recursive: true});

    this.app.use((req, res: express.Response, next) => {
      res.locals.timings?.startNext('session');
      next();
    });

    this.app.use(expressSession({
      name: 'sessID',
      secret: 'keyboard cat', // TODO
      store: new (SessionFileStore(expressSession))({
        path: sessionDirectory,
        retries: 0,
        secret: getConfig().data.secrets.session
      }),
      resave: false,
      saveUninitialized: false,
      rolling: true,
      unset: 'destroy',
      cookie: {
        secure: getConfig().data.baseUrl.startsWith('https://'),
        httpOnly: true,
        sameSite: 'lax',
        maxAge: /*getDatabase().isAvailable() ? 30 * 24 * 60 * 60 * 1000*/ /* 30d */ /*:*/ 30 * 24 * 60 * 60 * 1000 /* 14d */  // TODO
      }
    }));

    this.app.use(async (req: express.Request, res: express.Response, next): Promise<void> => {
      if (req.session.userId != null) {
        req.user = await new UserStorage().getUser(req.session.userId);
      }

      res.locals.timings?.startNext('sessionEnd');

      next();
    });
  }

  private setupErrorHandling(): void {
    this.app.use((req: express.Request, res, next) => {
      const htmlTemplate = Fs.readFileSync(Path.join(getAppResourcesDir(), 'error_pages', '404.html'), 'utf-8');

      res.status(404)
          .type('text/html')
          .send(StringUtils.format(htmlTemplate, {'currentUserName': req.user?.getDisplayName() ?? '<em>-</em>'}));
    });

    this.app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
      console.error(err);

      res.status(500)
          .type('text/plain')
          .send(`${err.message}\n\n${err.stack}`);
    });
  }

  static async runMiddleware(req: express.Request, res: express.Response, middleware: (req: express.Request, res: express.Response, next: express.NextFunction) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      middleware(req, res, (err) => {
        if (err) {
          reject(err);
          return;
        }

        resolve();
      });
    });
  }

  /**
   * @throws Error if the user is not logged in
   */
  static getUser(req: express.Request): AbstractUser {
    if (req.user instanceof AbstractUser) {
      return req.user;
    }

    throw new Error('User not logged in');
  }

  static async saveSession(req: express.Request): Promise<void> {
    return new Promise((resolve, reject) => {
      req.session.save((err) => {
        if (err) {
          return reject(err);
        }

        resolve();
      });
    });
  }

  private static requireValidLogin(req: express.Request, res: express.Response, next: express.NextFunction): void {
    if (!(req.user instanceof AbstractUser)) {
      res.redirect(generateLoginRedirectUri(req));
      return;
    }

    next();
  }
}
