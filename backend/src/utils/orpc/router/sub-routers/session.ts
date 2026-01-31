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
          if (context.authSession == null) {
            return null;
          }

          return {
            user: {
              id: context.authSession.user.id,
              name: context.authSession.user.displayName,
              isSuperUser: context.authSession.user.isSuperUser,
            },
          };
        }),
    };
  }
}
