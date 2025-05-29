import type Express from 'express';
import FrontendRenderingDataAccess from '../frontend/FrontendRenderingDataAccess';

export type SvelteKitRequest = { headers: { get(name: string): string | null } };
type SvelteKitHandler = { handler: Express.Handler };

export default class SvelteKitMiddleware {
  private readonly svelteHandler: Promise<SvelteKitHandler> = import('../../frontend/build/handler.js' as any);

  constructor() {
    (process as any).apollo_hacky_frontend_rendering_data_access_class = new FrontendRenderingDataAccess();
  }

  handle(req: Express.Request, res: Express.Response, next: Express.NextFunction): void {
    if (req.session.userId) {
      req.headers['x-apollo-logged-in-user-id'] = req.session.userId;
    }

    this.svelteHandler
      .then((svelteKitAdapter) => svelteKitAdapter.handler(req, res, next))
      .catch(next);
  }

  static register(app: Express.Application): void {
    const svelteKitMiddleware = new SvelteKitMiddleware();
    app.use((req, res, next) => svelteKitMiddleware.handle(req, res, next));
  }
}
