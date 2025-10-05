import type { IncomingMessage, ServerResponse } from 'node:http';
import Path from 'node:path';
import { APP_ROOT_DIR, IS_PRODUCTION } from '../../constants.js';

type SvelteKitHandler = (req: IncomingMessage, res: ServerResponse, next: (err?: any) => void) => void;

export default class FrontendRequestHandlerFactory {
  private readonly svelteKitMiddleware?: Promise<{ handler: SvelteKitHandler }>;

  constructor() {
    if (IS_PRODUCTION) {
      this.svelteKitMiddleware = import(Path.join(APP_ROOT_DIR, '..', 'frontend', 'dist', 'handler.js'));
    }
  }

  create(): (req: IncomingMessage, res: ServerResponse) => void {
    return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
      if (this.svelteKitMiddleware == null) {
        res.statusCode = 400;
        res.setHeader('content-type', 'text/plain; charset=utf-8');
        res.end(`Please access Apollo through the frontend's development server`);
        return;
      }

      (await this.svelteKitMiddleware).handler(req, res, (err) => {
        if (err != null) {
          console.error(err);

          if (!res.headersSent) {
            res.statusCode = 500;
          }
          res.destroy(err);
        }
      });
    };
  }
}
