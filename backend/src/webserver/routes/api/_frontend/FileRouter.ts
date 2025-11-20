import type { FastifyInstance, FastifyRequest } from 'fastify';
import { injectable } from 'tsyringe';
import UserByAuthProvider from '../../../../auth/UserByAuthProvider.js';
import { ContainerTokens } from '../../../../constants.js';
import FileSystemProvider from '../../../../files/FileSystemProvider.js';
import type { default as Router, RouteReturn } from '../../Router.js';

// TODO: Refactor this. oRPC has an endpoint too, that has veeeeeery similar logic
@injectable({ token: ContainerTokens.ROUTER })
export default class FileRouter implements Router {
  constructor(
    private readonly userByAuthProvider: UserByAuthProvider,
    private readonly fileSystemProvider: FileSystemProvider,
  ) {
  }

  register(server: FastifyInstance): void {
    server.route({
      method: ['GET'],
      url: '/api/_frontend/file',
      schema: {
        querystring: {
          type: 'object',
          required: ['fileSystemId', 'path'],
          properties: {
            fileSystemId: { type: 'string' },
            path: { type: 'string' },
          },
        },
      },
      // TODO: I want type-safety between the schema and the handler
      handler: async (request: FastifyRequest<{
        Querystring: { fileSystemId: string, path: string }
      }>, reply): Promise<RouteReturn> => {
        const apolloUser = await this.userByAuthProvider.provideByHeaders(request.headers);

        if (apolloUser == null) {
          return reply
            .status(401)
            .send({ error: 'Unauthorized' });
        }

        const allFileSystems = await this.fileSystemProvider.provideForUser(apolloUser);
        const fileSystem = request.query.fileSystemId === '_' ? allFileSystems.user[0] : [/*allFileSystems.trashBin,*/ ...allFileSystems.user].find((fs) => fs.id === request.query.fileSystemId);
        if (fileSystem == null) {
          return reply
            .status(404)
            .send({ error: 'File system or path not found' });
        }

        const requestedFile = fileSystem.getFile(request.query.path);
        if (!(await requestedFile.exists())) {
          return reply
            .status(404)
            .send({ error: 'File system or path not found' });
        }

        if (!(await requestedFile.isFile())) {
          return reply
            .status(400)
            .send({ error: 'Requested path is not a file' });
        }

        return reply
          // TODO: Try to send the correct MIME type
          // TODO: Support streaming and range requests for large files
          .header('Content-Type', 'application/octet-stream')
          // TODO: Sanitize filename or encode it properly
          .header('Content-Disposition', `filename="${requestedFile.getFileName()}"`)
          .send(requestedFile.supportsStreaming() ? requestedFile.createReadStream() : await requestedFile.read());
      },
    });
  }
}
