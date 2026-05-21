import { injectable } from 'tsyringe';
import { z } from 'zod';
import { ContainerTokens } from '../../../../constants.js';
import FileSystemProvider from '../../../../files/FileSystemProvider.js';
import type { FastifyInstanceWithZod } from '../../../server/FastifyWebServer.js';
import type { default as Router, RouteReturn } from '../../Router.js';

// TODO: Refactor this. oRPC has an endpoint too, that has veeeeeery similar logic
@injectable({ token: ContainerTokens.ROUTER })
export default class FileRouter implements Router {
  constructor(
    private readonly fileSystemProvider: FileSystemProvider,
  ) {
  }

  register(server: FastifyInstanceWithZod): void {
    server.route({
      method: ['GET'],
      url: '/api/_frontend/file',
      schema: {
        querystring: z.object({
          fileSystemId: z.string(),
          path: z.string(),
        }),
      },
      handler: async (request, reply): Promise<RouteReturn> => {
        const allFileSystems = await this.fileSystemProvider.provideForUser(request.getAuthenticatedUser());
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
          .header('Content-Disposition', this.generateContentDispositionHeaderValueForFileName(requestedFile.getFileName()))
          .send(requestedFile.supportsStreaming() ? requestedFile.createReadStream() : await requestedFile.read());
      },
    });
  }

  private generateContentDispositionHeaderValueForFileName(name: string): string {
    // Strip control chars (esp. CR/LF/NUL) and replace path separators (just in case)
    const cleaned = name
      .replace(/[\x00-\x1F\x7F]/g, '')
      .replace(/[\\/]/g, '_')
      .trim() || 'download';

    // Replace non-ASCII with '_' and Backslash-escape `"` and `\`
    const asciiFallback = cleaned
      .replace(/[^\x20-\x7E]/g, '_')
      .replace(/(["\\])/g, '\\$1');

    // RFC 5987/8187 (encodeURIComponent leaves `!*'()` unencoded; `*'()` are not *attr-char* and need encoding)
    const utf8Encoded = encodeURIComponent(cleaned)
      .replace(/['()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());

    return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${utf8Encoded}`;
  }
}
