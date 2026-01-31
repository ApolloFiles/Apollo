import { injectable } from 'tsyringe';
import AccountCreationInviteFinder from '../../../../auth/account_creation_invite/AccountCreationInviteFinder.js';
import type { ORpcImplementer, SubRouter } from '../ORpcRouter.js';

@injectable()
export default class AuthORpcRouterFactory {
  constructor(
    private readonly accountCreationInviteFinder: AccountCreationInviteFinder,
  ) {
  }

  create(os: ORpcImplementer['auth']): SubRouter<'auth'> {
    return {
      accountCreationInvitation: {
        get: os
          .accountCreationInvitation
          .get
          .handler(async ({ input, context, errors }) => {
            if (context.authSession != null) {
              throw errors.NOT_AVAILABLE_FOR_LOGGED_IN_USER();
            }

            const inviteToken = await this.accountCreationInviteFinder.findByToken(input.token);
            if (inviteToken == null) {
              throw errors.REQUESTED_ENTITY_NOT_FOUND();
            }

            return {
              createdAt: inviteToken.createdAt,
              expiresAt: inviteToken.expiresAt,
            };
          }),
      },
    };
  }
}
