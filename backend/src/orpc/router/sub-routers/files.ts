import Path from 'node:path';
import { injectable } from 'tsyringe';
import FileProvider from '../../../files/FileProvider.js';
import FileSystemProvider from '../../../files/FileSystemProvider.js';
import LocalFileSystem from '../../../files/local/LocalFileSystem.js';
import FileNameCollator from '../../../files/util/FileNameCollator.js';
import type VirtualFile from '../../../files/VirtualFile.js';
import ApolloFileURI from '../../../uri/ApolloFileURI.js';
import type { ORpcContractOutputs } from '../../contract/oRpcContract.js';
import type { ORpcImplementer, SubRouter } from '../ORpcRouter.js';

@injectable()
export default class FilesORpcRouterFactory {
  constructor(
    private readonly fileSystemProvider: FileSystemProvider,
    private readonly fileProvider: FileProvider,
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

      filePicker: {
        start: os.filePicker.start.handler(async ({ input, context, errors }) => {
          const allFileSystems = await this.fileSystemProvider.provideForUser(context.authSession.user);

          const directory = allFileSystems.user[0].getFile('/');
          const openDirectoryResult = await this.constructOpenDirectoryResponse(directory);

          return {
            ...openDirectoryResult,

            allFileSystems: allFileSystems.user.map(fs => ({
              displayName: fs.id,
              uri: fs.toURI().toString(),
              isLocalFileSystem: fs instanceof LocalFileSystem,
            })),
          } satisfies ORpcContractOutputs['files']['filePicker']['start'];
        }),
        openDirectory: os.filePicker.openDirectory.handler(async ({ input, context, errors }) => {
          // TODO: catch and nicely handle errors (permission denied, invalid URI, etc.)
          const requestedFile = await this.fileProvider.provideForUserByUri(context.authSession.user, ApolloFileURI.parse(input.uri));

          if (!(await requestedFile.isDirectory())) {
            // TODO: throw nicer error that can be caught in the frontend
            throw errors.INVALID_INPUT();
          }

          return this.constructOpenDirectoryResponse(requestedFile);
        }),
      },
    };
  }

  private async constructOpenDirectoryResponse(directory: VirtualFile): Promise<ORpcContractOutputs['files']['filePicker']['openDirectory']> {
    const currentDirectoryFiles = [];
    for (const file of (await directory.getFiles())) {
      currentDirectoryFiles.push({
        name: file.getFileName(),
        uri: file.toURI().toString(),
        isDirectory: await file.isDirectory(),
      });
    }

    // Sort directories to top and then alphabetical
    currentDirectoryFiles.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) {
        return a.isDirectory ? -1 : 1;
      }

      return FileNameCollator.compare(a.name, b.name);
    });

    const directoryBreadcrumbs: { name: string, uri: string, isDirectory: true }[] = [];
    let currentBreadcrumbDirectory: VirtualFile = directory;
    while (currentBreadcrumbDirectory.path !== '/') {
      directoryBreadcrumbs.unshift({
        name: currentBreadcrumbDirectory.getFileName(),
        uri: currentBreadcrumbDirectory.toURI().toString(),
        isDirectory: true,
      });

      currentBreadcrumbDirectory = currentBreadcrumbDirectory.fileSystem.getFile(Path.dirname(currentBreadcrumbDirectory.path));
    }

    const directoriesAtFileSystemRoot: { name: string, uri: string, isDirectory: true }[] = [];
    for (const file of (await directory.fileSystem.getFile('/').getFiles())) {
      if (await file.isDirectory()) {
        directoriesAtFileSystemRoot.push({
          name: file.getFileName(),
          uri: file.toURI().toString(),
          isDirectory: true,
        });
      }
    }

    return {
      currentFileSystem: {
        displayName: directory.fileSystem.id,
        uri: directory.fileSystem.toURI().toString(),
        isLocalFileSystem: directory.fileSystem instanceof LocalFileSystem,

        directoriesAtRoot: directoriesAtFileSystemRoot,
      },

      currentDirectory: {
        name: directory.getFileName(),
        uri: directory.toURI().toString(),

        breadcrumbs: directoryBreadcrumbs,

        files: currentDirectoryFiles,
      },
    };
  }
}
