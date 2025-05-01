import { handleRequestRestfully, StringUtils } from '@spraxdev/node-commons';
import express from 'express';
import expressSession from 'express-session';
import Fs from 'node:fs';
import Http from 'node:http';
import Path from 'node:path';
import SessionFileStore from 'session-file-store';
import { WebSocketServer } from 'ws';
import { getAppConfigDir, getAppResourcesDir, getConfig, isProduction } from '../Constants';
import { ApolloWebSocket } from '../global';
import { createMediaRouter } from '../media/MediaRouter';
import { ServerTiming } from '../ServerTiming';
import ApolloUser from '../user/ApolloUser';
import ApolloUserStorage from '../user/ApolloUserStorage';
import { adminRouter } from './AdminRouter';
import { createAliasRouter } from './AliasRouter';
import { apiRouter } from './Api/ApiRouter';
import { v0ApiRouter } from './Api/v0';
import { createFilesRouter } from './Browse/FilesRouter';
import { generateLoginRedirectUri, loginRouter } from './LoginRouter';
import SvelteKitMiddleware from './SvelteKitMiddleware';

export default class WebServer {
  protected app: express.Application;
  protected server?: Http.Server;
  protected webSocketServer?: WebSocketServer;
  protected sessionMiddleware?: express.RequestHandler;

  protected listenEventHandlers: (() => void)[] = [];

  constructor() {
    this.app = express();

    this.app.disable('x-powered-by');
    this.app.set('trust proxy', getConfig().data.webserver.trustProxy);
    this.app.set('etag', false);

    this.app.use(ServerTiming.getExpressMiddleware(true /*!isProduction()*/));  // TODO: remove debug

    const staticRouteOptions = { index: false, etag: false, redirect: false };
    this.app.use('/', express.static(Path.join(getAppResourcesDir(), 'public', 'static'), staticRouteOptions));
    this.app.use('/favicon.ico', express.static(Path.join(getAppResourcesDir(), 'public', 'static', 'favicon', 'favicon.ico'), staticRouteOptions));
    this.app.use('/node_modules', express.static(Path.join(getAppResourcesDir(), '..', 'node_modules'), staticRouteOptions));
    if (!isProduction()) {
      this.app.use('/nuxt-frontend', express.static(Path.join(getAppResourcesDir(), 'public', 'static', 'nuxt-frontend', '.output', 'public'), staticRouteOptions));
    }

    this.setupAuthenticationMiddlewares();

    this.app.use('/admin', WebServer.requireValidLogin, adminRouter);

    this.app.use('/api/v0', WebServer.requireValidLogin, v0ApiRouter);  // FIXME: This should not redirect to login page!
    this.app.use('/api', apiRouter);
    this.app.use('/browse', WebServer.requireValidLogin, createFilesRouter('browse'));
    this.app.use('/trash', WebServer.requireValidLogin, createFilesRouter('trash'));
    this.app.use('/media', WebServer.requireValidLogin, createMediaRouter(this, this.sessionMiddleware!));
    this.app.use('/alias', /*WebServer.requireValidLogin, FIXME */ createAliasRouter());
    this.app.use('/login', loginRouter);
    this.app.use('/logout', (req: express.Request, res, next) => {
      // Store cookie properties for manual deletion
      const cookie = req.session.cookie;
      cookie.maxAge = 0;

      // Destroy session
      req.session.destroy((err) => {
        if (err) {
          return next(err);
        }

        // Delete cookie
        res.clearCookie('sessID', {
          domain: cookie.domain,
          httpOnly: cookie.httpOnly,
          maxAge: 0,
          path: cookie.path,
          sameSite: cookie.sameSite,
          secure: cookie.secure == 'auto' ? req.secure : cookie.secure,
        });

        res.redirect('/');
      });
    });

    this.app.use('/api', WebServer.requireValidLogin, apiRouter);

    this.app.all('/', (req: express.Request, res, next) => {
      handleRequestRestfully(req, res, next, {
        get: () => {
          res.redirect('/browse/');
        },
      });
    });

    SvelteKitMiddleware.register(this.app);

    this.setupErrorHandling();
  }

  async listen(port: number, host?: string): Promise<void> {
    const startListening = async (): Promise<void> => {
      return new Promise((resolve) => {
        this.server = this.app.listen(port, host ?? '127.0.0.1', () => resolve());
      });
    };

    await this.shutdown();
    await startListening();

    // TODO: Write WebSocket abstraction to handle everything including sessions, authentication, trust-proxy-setting, etc.
    this.webSocketServer = new WebSocketServer({
      server: this.server,
      maxPayload: 5 * 1024 * 1024 /* 5 MiB */,
      allowSynchronousEvents: true,
    } as any /* FIXME: types are outdated, any cast should be removed when possible */);
    this.webSocketServer.on('error', console.error);
    this.webSocketServer.on('connection', (client: ApolloWebSocket, request) => {
      client.apollo = { isAlive: true, pingRtt: -1, lastPingTimestamp: -1 };

      client.on('close', (code, reason) => {
        console.log(`WebSocket from ${request.socket.remoteAddress} closed: ${code} ${reason}`);
      });

      console.log('WebSocket connection accepted from ' + request.socket.remoteAddress);
      client.on('pong', () => {
        client.apollo.isAlive = true;
        client.apollo.pingRtt = Date.now() - client.apollo.lastPingTimestamp;
      });
    });

    const intervalTask = setInterval(() => {
      this.webSocketServer?.clients.forEach((_client) => {
        const client: ApolloWebSocket = _client as any;
        if (client.apollo.isAlive === false) {
          // console.error('[DEBUG] Would normally close connection from ' + (client as any)._socket.remoteAddress + ' due to inactivity (no pong received)');
          console.log('Closing WebSocket connection from ' + (client as any)._socket.remoteAddress + ' due to inactivity (no pong received)');
          return client.terminate();
        }

        client.apollo.isAlive = false;
        client.apollo.lastPingTimestamp = Date.now();
        client.ping();
      });
    }, 10_000);
    this.webSocketServer.on('close', () => clearInterval(intervalTask));

    this.listenEventHandlers.forEach((handler) => handler());
  }

  async shutdown(): Promise<void> {
    const closeWebSocketServer = async (): Promise<void> => {
      return new Promise((resolve) => {
        if (this.webSocketServer == null) {
          resolve();
          return;
        }

        this.webSocketServer.close((err) => {
          if (err) {
            console.error(err);
          }
          resolve();
        });
      });
    };

    await closeWebSocketServer();
    this.webSocketServer = undefined;

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

  addListenEventHandler(handler: () => void): void {
    this.listenEventHandlers.push(handler);
  }

  getWebSocketServer(): WebSocketServer | undefined {
    return this.webSocketServer;
  }

  private setupAuthenticationMiddlewares(): void {
    const sessionDirectory = Path.join(getAppConfigDir(), 'sessions');
    Fs.mkdirSync(sessionDirectory, { recursive: true });

    this.app.use((req, res: express.Response, next) => {
      res.locals.timings?.startNext('session');
      next();
    });

    this.sessionMiddleware = expressSession({
      name: 'sessID',
      secret: getConfig().data.secrets.session,
      store: new (SessionFileStore(expressSession))({
        path: sessionDirectory,
        retries: 0,
        secret: getConfig().data.secrets.session,
      }),
      resave: false,
      saveUninitialized: false,
      rolling: true,
      unset: 'destroy',
      cookie: {
        secure: getConfig().data.baseUrl.startsWith('https://'),
        httpOnly: true,
        sameSite: 'lax',
        maxAge: /*getDatabase().isAvailable() ? 30 * 24 * 60 * 60 * 1000*/ /* 30d */ /*:*/ 30 * 24 * 60 * 60 * 1000, /* 14d */  // TODO
      },
    });
    this.app.use(this.sessionMiddleware);

    this.app.use(async (req: express.Request, res: express.Response, next): Promise<void> => {
      if (req.session.userId != null) {
        req.user = await new ApolloUserStorage().findById(BigInt(req.session.userId));
      }

      res.locals.timings?.startNext('continue-req-handling');

      next();
    });

    this.app.use(async (req: express.Request, res: express.Response, next): Promise<void> => {
      if (req.user != null) {
        next();
        return;
      }

      const authHeader = req.header('Authorization');
      if (authHeader == null || !authHeader.startsWith('Bearer ')) {
        next();
        return;
      }

      const token = authHeader.substring('Bearer '.length);
      const user = await new ApolloUserStorage().findByApiToken(token);
      if (user != null) {
        req.user = user;
        console.debug(`Authenticated request for user ${req.user.id} (${req.user.displayName}) from ApiToken`);
      }

      next();
    });
  }

  private setupErrorHandling(): void {
    this.app.use((req: express.Request, res, next) => {
      const htmlTemplate = Fs.readFileSync(Path.join(getAppResourcesDir(), 'error_pages', '404.html'), 'utf-8');

      res
        .status(404)
        .type('text/html')
        .send(StringUtils.format(htmlTemplate, { 'currentUserName': req.user?.displayName ?? '<em>-</em>' }));
    });

    this.app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
      console.error(err);
      if (res.headersSent) {
        return;
      }

      res
        .status(500)
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
  static getUser(req: express.Request): ApolloUser {
    if (req.user instanceof ApolloUser) {
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
    if (!(req.user instanceof ApolloUser)) {
      res.redirect(generateLoginRedirectUri(req));
      return;
    }

    next();
  }
}
