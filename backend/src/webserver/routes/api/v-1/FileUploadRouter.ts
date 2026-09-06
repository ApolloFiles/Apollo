import type { FastifyRequest } from 'fastify';
import { injectable } from 'tsyringe';
import { z } from 'zod';
import { ContainerTokens } from '../../../../constants.js';
import FileSystemInFileUriNotFoundError from '../../../../files/provider/errors/FileSystemInFileUriNotFoundError.js';
import PermissionAwareFileProvider from '../../../../files/provider/PermissionAwareFileProvider.js';
import type VirtualFile from '../../../../files/VirtualFile.js';
import type WriteableVirtualFile from '../../../../files/WriteableVirtualFile.js';
import ApolloFileURI from '../../../../uri/ApolloFileURI.js';
import InvalidApolloURIError from '../../../../uri/errors/InvalidApolloURIError.js';
import type ApolloUser from '../../../../user/ApolloUser.js';
import {
  BadRequestError,
  ConflictError,
  LengthRequiredError,
  NotFoundError,
  PayloadTooLargeError,
} from '../../../errors/HttpErrors.js';
import type { FastifyInstanceWithZod } from '../../../server/FastifyWebServer.js';
import type { default as Router, RouteReturn } from '../../Router.js';

// A temporary file upload endpoint for a friend – Delete when I took some time to design a proper and 'final' API for stuff :3
@injectable({ token: ContainerTokens.ROUTER })
export default class FileUploadRouter implements Router {
  private static readonly MAX_UPLOAD_SIZE_BYTES = 300 * 1024 * 1024;

  constructor(
    private readonly permissionAwareFileProvider: PermissionAwareFileProvider,
  ) {
  }

  getRoutePrefix(): string {
    return '/api/v-1';
  }

  allowAccessTokenAccess(): boolean {
    return true;
  }

  register(server: FastifyInstanceWithZod): void {
    server.removeAllContentTypeParsers();
    server.addContentTypeParser('*', {
      parseAs: 'buffer',
      bodyLimit: FileUploadRouter.MAX_UPLOAD_SIZE_BYTES,
    }, (_request, body, done) => done(null, body));

    server.route({
      method: 'PUT',
      url: '/files/:fileSystemId/*',
      schema: {
        params: z.object({
          fileSystemId: z.string(),
          '*': z.string(),
        }),
        querystring: z.object({
          overwrite: z.stringbool().optional(),
        }),
      },
      onRequest: async (request: FastifyRequest): Promise<void> => {
        this.requireContentLengthWithinLimit(request);
      },
      handler: async (request, reply): Promise<RouteReturn> => {
        const user = request.getAuthenticatedUser();
        const fileUri = this.createFileUri(user, request.params.fileSystemId, request.params['*']);
        const overwrite = request.query.overwrite ?? true;

        // Fastify skips body parsing entirely for an empty body, so `Content-Length: 0` uploads an empty file
        const fileContent = Buffer.isBuffer(request.body) ? request.body : Buffer.alloc(0);

        const writeableFile = await this.provideFileForWrite(fileUri, user);
        const fileAlreadyExists = await this.determineIfFileCanBeWritten(writeableFile.file, overwrite);
        await writeableFile.write(fileContent);

        return reply
          .code(fileAlreadyExists ? 200 : 201)
          .send({
            uri: writeableFile.file.toURI().toString(),
            fileSystemId: fileUri.fileSystemId,
            path: writeableFile.file.path,
            name: writeableFile.file.getFileName(),
            sizeBytes: fileContent.length,
          });
      },
    });
  }

  private async provideFileForWrite(fileUri: ApolloFileURI, user: ApolloUser): Promise<WriteableVirtualFile> {
    try {
      return await this.permissionAwareFileProvider.provideForWrite(fileUri, user);
    } catch (err: unknown) {
      if (err instanceof FileSystemInFileUriNotFoundError) {
        throw new NotFoundError('File system not found');
      }
      throw err;
    }
  }

  private requireContentLengthWithinLimit(request: FastifyRequest): void {
    const contentLength = request.headers['content-length'];
    if (contentLength == null) {
      throw new LengthRequiredError();
    }
    if (parseInt(contentLength, 10) > FileUploadRouter.MAX_UPLOAD_SIZE_BYTES) {
      throw new PayloadTooLargeError(`Uploads are limited to ${FileUploadRouter.MAX_UPLOAD_SIZE_BYTES} bytes`);
    }
  }

  /** @returns `true` if the file already exists and is about to be overwritten */
  private async determineIfFileCanBeWritten(targetFile: VirtualFile, overwrite: boolean): Promise<boolean> {
    if (!(await targetFile.exists())) {
      return false;
    }

    if (await targetFile.isDirectory()) {
      throw new ConflictError('The requested path is an existing directory');
    }
    if (!overwrite) {
      throw new ConflictError('The requested file already exists');
    }
    return true;
  }

  private createFileUri(user: ApolloUser, fileSystemId: string, filePath: string): ApolloFileURI {
    let fileUri: ApolloFileURI;
    try {
      fileUri = ApolloFileURI.create(user.id, fileSystemId, filePath);
    } catch (err: unknown) {
      if (err instanceof InvalidApolloURIError) {
        throw new BadRequestError('The requested file path is invalid');
      }
      throw err;
    }

    if (fileUri.filePath === '/') {
      throw new BadRequestError('The requested file path is invalid');
    }
    return fileUri;
  }
}
