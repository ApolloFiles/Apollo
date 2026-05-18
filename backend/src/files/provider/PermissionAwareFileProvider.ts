import { singleton } from 'tsyringe';
import FileAccessContext from '../../permission/file/FileAccessContext.js';
import FilePermissionEvaluator from '../../permission/file/FilePermissionEvaluator.js';
import type ApolloFileURI from '../../uri/ApolloFileURI.js';
import type ApolloUser from '../../user/ApolloUser.js';
import type VirtualFile from '../VirtualFile.js';
import type WriteableVirtualFile from '../WriteableVirtualFile.js';
import FileProvider from './FileProvider.js';

@singleton()
export default class PermissionAwareFileProvider {
  constructor(
    private readonly fileProvider: FileProvider,
    private readonly filePermissionEvaluator: FilePermissionEvaluator,
  ) {
  }

  async provideForRead(uri: ApolloFileURI, user: ApolloUser): Promise<VirtualFile> {
    await this.filePermissionEvaluator.ensureAllowed(new FileAccessContext(user, uri, 'read'));
    return this.fileProvider.provideByUri(uri);
  }

  async provideForWrite(uri: ApolloFileURI, user: ApolloUser): Promise<WriteableVirtualFile> {
    await this.filePermissionEvaluator.ensureAllowed(new FileAccessContext(user, uri, 'write'));

    const file = await this.fileProvider.provideByUri(uri);
    return file.fileSystem.getWriteableFile(file);
  }

  async provideForMediaContextRead(uri: ApolloFileURI, user: ApolloUser): Promise<VirtualFile> {
    await this.filePermissionEvaluator.ensureAllowed(new FileAccessContext(user, uri, 'read-in-media-context'));
    return this.fileProvider.provideByUri(uri);
  }
}
