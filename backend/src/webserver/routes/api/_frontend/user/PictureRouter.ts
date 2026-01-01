import { injectable } from 'tsyringe';
import { z } from 'zod';
import { ContainerTokens } from '../../../../../constants.js';
import ProfilePictureProvider from '../../../../../user/picture/ProfilePictureProvider.js';
import UserProvider from '../../../../../user/UserProvider.js';
import { NotFoundError } from '../../../../errors/HttpErrors.js';
import type { FastifyInstanceWithZod } from '../../../../server/FastifyWebServer.js';
import type { default as Router, RouteReturn } from '../../../Router.js';

@injectable({ token: ContainerTokens.ROUTER })
export default class PictureRouter implements Router {
  constructor(
    private readonly userProvider: UserProvider,
    private readonly profilePictureProvider: ProfilePictureProvider,
  ) {
  }

  getRoutePrefix(): string {
    return '/api/_frontend/user';
  }

  register(server: FastifyInstanceWithZod): void {
    server.get(
      '/:userId/picture.png',
      {
        schema: {
          params: z.object({
            userId: z.string().nonempty(),
          }),
        },
      },
      async (request, reply): Promise<RouteReturn> => {
        const requestedUser = await this.userProvider.findById(request.params.userId);
        if (requestedUser == null) {
          throw new NotFoundError();
        }

        const profilePicture = await this.profilePictureProvider.provide(requestedUser);

        return reply
          .type('image/png')
          .send(profilePicture);
      },
    );
  }
}
