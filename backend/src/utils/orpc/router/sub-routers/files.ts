import { injectable } from 'tsyringe';
import FileSystemProvider from '../../../../files/FileSystemProvider.js';
import type { ORpcImplementer, SubRouter } from '../ORpcRouter.js';

@injectable()
export default class FilesORpcRouterFactory {
  constructor(
    private readonly fileSystemProvider: FileSystemProvider,
  ) {
  }

  create(os: ORpcImplementer['files']): SubRouter<'files'> {
    return {
      browse: {
        listFilesInVirtualFileSystem: os.browse.listFilesInVirtualFileSystem
          .handler(async ({ input, context, errors }) => {
            const allFileSystems = await this.fileSystemProvider.provideForUser(context.authSession.user);
            const fileSystem = input.fileSystemId === '_' ? allFileSystems.user[0] : [/*allFileSystems.trashBin,*/ ...allFileSystems.user].find((fs) => fs.id === input.fileSystemId);
            if (fileSystem == null) {
              throw errors.REQUESTED_ENTITY_NOT_FOUND();
            }

            const requestedFile = fileSystem.getFile(input.path);
            if (!(await requestedFile.exists())) {
              throw errors.REQUESTED_ENTITY_NOT_FOUND();
            }

            if (!(await requestedFile.isDirectory())) {
              // TODO: Proper error handling
              console.debug('Requested path is not a directory');
              throw new Error('Requested path is not a directory');
            }

            const result: {
              files: {
                name: string,
                isDirectory: boolean,
                path: string,
              }[],
            } = {
              files: [],
            };

            for (const fileListElement of (await requestedFile.getFiles())) {
              result.files.push({
                name: fileListElement.getFileName(),
                isDirectory: await fileListElement.isDirectory(),
                path: fileListElement.path,
              });
            }

            return result;
          }),
      },
    };
  }
}
