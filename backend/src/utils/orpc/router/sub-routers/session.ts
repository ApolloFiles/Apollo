import { injectable } from 'tsyringe';
import type { OptionallyAuthenticatedORpcImplementer, SubRouter } from '../ORpcRouter.js';

@injectable()
export default class SessionORpcRouterFactory {
  constructor() {
  }

  create(os: OptionallyAuthenticatedORpcImplementer): SubRouter<'session'> {
    return {
      get: os.session.get
        .handler(({ context }) => {
          if (context.sessionInfo == null) {
            return null;
          }

          return {
            user: context.sessionInfo.user,
          };
        }),
    };
  }
}
