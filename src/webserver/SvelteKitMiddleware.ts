import type Express from 'express';
import FrontendRenderingDataAccess from '../frontend/FrontendRenderingDataAccess';

export default class SvelteKitMiddleware {
  private svelteHandler = import('../../frontend/build/handler.js' as any);

  constructor() {
    (process as any).apollo_hacky_frontend_rendering_data_access_class = new FrontendRenderingDataAccess();
  }

  handle(req: Express.Request, res: Express.Response, next: Express.NextFunction): void {
    req.query._apollo_logged_in_user_id = req.session.userId;

    const parsedUrl = new URL(req.url, 'http://localhost:8080');
    parsedUrl.searchParams.set('_apollo_logged_in_user_id', req.session.userId ?? '');
    req.url = parsedUrl.pathname + parsedUrl.search;

    this.svelteHandler
      .then((svelteKitAdapter) => svelteKitAdapter.handler(req, res, next))
      .catch(next);
  }

  static register(app: Express.Application): void {
    const svelteKitMiddleware = new SvelteKitMiddleware();
    app.use((req, res, next) => {
      console.log('Letting Svelte handle the request:', req.originalUrl);
      svelteKitMiddleware.handle(req, res, next);
    });
  }
}
