import { NotFoundError } from '@sprax/node-framework';
import { type FastifyInstanceWithZod, HttpRouter, type RouteReturn } from '@sprax/node-framework/web';
import { z } from 'zod';
import ProfilePictureProvider from '../../../../../user/picture/ProfilePictureProvider.js';
import UserProvider from '../../../../../user/UserProvider.js';
import type ApolloRouter from '../../../../server/ApolloRouter.js';

@HttpRouter()
export default class PictureRouter implements ApolloRouter {
  constructor(
    private readonly userProvider: UserProvider,
    private readonly profilePictureProvider: ProfilePictureProvider,
  ) {
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
