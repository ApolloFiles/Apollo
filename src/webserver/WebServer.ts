import { StringUtils } from '@spraxdev/node-commons';
import express from 'express';
import expressSession from 'express-session';
import Fs from 'fs';
import * as Http from 'http';
import passport from 'passport';
import Path from 'path';
import SessionFileStore from 'session-file-store';
import AbstractUser from '../AbstractUser';
import { getAppConfigDir, getAppResourcesDir } from '../Constants';
import { adminRouter } from './AdminRouter';
import { createAliasRouter } from './AliasRouter';
import { createFilesRouter } from './Browse/FilesRouter';
import { loginRouter } from './LoginRouter';

export default class WebServer {
  protected app: express.Application;
  protected server?: Http.Server;

  constructor() {
    this.app = express();

    this.app.disable('x-powered-by');

    this.setupSessionMiddleware();
    this.app.use(passport.initialize(), passport.authenticate('session'));

    this.app.use('/', express.static(Path.join(getAppResourcesDir(), 'public', 'static')));
    this.app.use('/favicon.ico', express.static(Path.join(getAppResourcesDir(), 'public', 'static', 'favicon', 'favicon.ico')));
    this.app.use('/node_modules', express.static(Path.join(getAppResourcesDir(), '..', 'node_modules')));

    this.app.use('/admin', WebServer.requireValidLogin, adminRouter);

    this.app.use('/browse', WebServer.requireValidLogin, createFilesRouter('browse'));
    this.app.use('/trash', WebServer.requireValidLogin, createFilesRouter('trash'));
    this.app.use('/alias', /*WebServer.requireValidLogin, FIXME */ createAliasRouter());
    this.app.use('/login', loginRouter);
    this.app.use('/logout', (req, res) => {
      req.logout();
      res.redirect('/');
    });

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

    this.app.use(expressSession({
      secret: 'keyboard cat', // TODO
      resave: false,
      saveUninitialized: false,
      // store: new expressSession.MemoryStore() // TODO
      store: new (SessionFileStore(expressSession))({path: sessionDirectory, retries: 0})
    }));
  }

  private setupErrorHandling(): void {
    this.app.use((req, res, next) => {
      const htmlTemplate = Fs.readFileSync(Path.join(getAppResourcesDir(), 'error_pages', '404.html'), 'utf-8');

      res.status(404)
          .type('text/html')
          .send(StringUtils.format(htmlTemplate, {'currentUserName': (req.user as AbstractUser)?.getDisplayName() ?? '<em>-</em>'}));
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

  private static requireValidLogin(req: express.Request, res: express.Response, next: express.NextFunction): void {
    if (!(req.user instanceof AbstractUser)) {
      res.status(401)
          .type('text/html')
          .send(Fs.readFileSync(Path.join(getAppResourcesDir(), 'error_pages', '401.html'), 'utf8'));
      return;
    }

    next();
  }
}
