import { singleton } from 'tsyringe';
import type EventRegistry from '../../plugins/builtin/event/EventRegistry.js';
import FileDeletedEvent from '../../plugins/builtin/event/events/FileDeletedEvent.js';
import FileRenamedEvent from '../../plugins/builtin/event/events/FileRenamedEvent.js';
import type FileSystemProvider from '../FileSystemProvider.js';

@singleton()
export default class ApolloFileSystemEventListener {
  constructor(
    fileSystemProvider: FileSystemProvider,
    eventRegistry: EventRegistry,
  ) {
    eventRegistry
      .for(FileDeletedEvent)
      .on(async (event) => {
        console.debug('ApolloFileSystemEventListener: FileDeletedEvent');

        const fileSystems = fileSystemProvider.provideApolloFileSystemsForUser(event.file.fileSystem.owner);
        await fileSystems.cache.deleteForFile(event.file);
      });

    eventRegistry
      .for(FileRenamedEvent)
      .on(async (event) => {
        console.debug('ApolloFileSystemEventListener: FileRenamedEvent');

        const fileSystems = fileSystemProvider.provideApolloFileSystemsForUser(event.oldFile.fileSystem.owner);

        if (event.oldFile.fileSystem.owner.id !== event.newFile.fileSystem.owner.id) {
          console.warn('[WARN] FileRenamedEvent across different users/owners is not supported for cache management (and should not have happened)');
          await fileSystems.cache.deleteForFile(event.oldFile);
          return;
        }

        await fileSystems.cache.moveForFile(event.oldFile, event.newFile);
      });
  }
}
