import { getClientSideRpcClient } from '$lib/oRPCClientSide';
import type { ORpcContractOutputs } from '$lib/ORpcHelper';

type FileSystemInfo = { displayName: string, uri: string, isLocalFileSystem: boolean };
type FileInfo = { name: string, uri: string, isDirectory: boolean };

export default class ApolloFilePickerState {
  /* <fileSystemURI, Map<directoryURI, FileData[]>> */
  private fileSystemFileTreeCache = new Map<string, Map<string, FileInfo[]>>();
  /** Incremented on every cache write so external $derived calls re-evaluate */
  private _cacheVersion = $state(0);

  private _allFileSystems: FileSystemInfo[] = $state([]);
  private _currentFileSystem: FileSystemInfo | null = $state(null);
  private _currentDirectory: FileInfo & { breadcrumbs: FileInfo[] } | null = $state(null);

  private _currentBreadcrumbs: FileInfo[] = $derived(this._currentDirectory?.breadcrumbs ?? []);
  private _currentFiles: FileInfo[] = $derived.by(() => {
    if (this._currentFileSystem == null || this._currentDirectory == null) {
      return [];
    }
    return this.fileSystemFileTreeCache.get(this._currentFileSystem.uri)?.get(this._currentDirectory.uri ?? '') ?? [];
  });

  get allFileSystems(): ReadonlyArray<FileSystemInfo> {
    return this._allFileSystems;
  }

  get currentDirectory(): Readonly<FileInfo> | null {
    return this._currentDirectory;
  }

  get breadcrumbs(): ReadonlyArray<FileInfo> {
    return this._currentBreadcrumbs;
  }

  get currentFileSystem(): Readonly<FileSystemInfo> | null {
    return this._currentFileSystem;
  }

  get currentFiles(): ReadonlyArray<FileInfo> {
    return this._currentFiles;
  }

  getDirectoriesForTree(directoryUri: string | null): ReadonlyArray<FileInfo> {
    // Subscribe to _cacheVersion, so reactive callers re-run when the cache is updated
    // noinspection BadExpressionStatementJS
    this._cacheVersion;

    if (this._currentFileSystem == null) {
      return [];
    }

    const fileTreeCache = this.fileSystemFileTreeCache.get(this._currentFileSystem.uri);
    if (fileTreeCache == null) {
      return [];
    }

    const filesInDirectory = fileTreeCache.get(directoryUri ?? this._currentFileSystem.uri);
    if (filesInDirectory == null) {
      return [];
    }

    return filesInDirectory.filter(f => f.isDirectory);
  }

  async init(): Promise<void> {
    const initData = await getClientSideRpcClient().files.filePicker.start();

    this._allFileSystems = initData.allFileSystems;
    this.processCurrentFileSystemAndDirectoryData(initData);
  }

  async navigateToDirectory(uri: string): Promise<void> {
    const directoryData = await getClientSideRpcClient().files.filePicker.openDirectory({ uri });
    this.processCurrentFileSystemAndDirectoryData(directoryData);
  }

  async fetchDirectoryForTree(uri: string): Promise<void> {
    const data = await getClientSideRpcClient().files.filePicker.openDirectory({ uri });
    this.populateFileTreeCache(data);
  }

  private populateFileTreeCache(data: ORpcContractOutputs['files']['filePicker']['openDirectory']): void {
    if (!this.fileSystemFileTreeCache.has(data.currentFileSystem.uri)) {
      this.fileSystemFileTreeCache.set(data.currentFileSystem.uri, new Map());
    }

    const fileTreeCache = this.fileSystemFileTreeCache.get(data.currentFileSystem.uri)!;
    fileTreeCache.set(data.currentFileSystem.uri, data.currentFileSystem.directoriesAtRoot);
    fileTreeCache.set(data.currentDirectory.uri, data.currentDirectory.files);

    ++this._cacheVersion;
  }

  private processCurrentFileSystemAndDirectoryData(data: ORpcContractOutputs['files']['filePicker']['openDirectory']): void {
    this.populateFileTreeCache(data);

    this._currentFileSystem = {
      displayName: data.currentFileSystem.displayName,
      uri: data.currentFileSystem.uri,
      isLocalFileSystem: data.currentFileSystem.isLocalFileSystem,
    };

    this._currentDirectory = {
      name: data.currentDirectory.name,
      uri: data.currentDirectory.uri,
      isDirectory: true,

      breadcrumbs: data.currentDirectory.breadcrumbs,
    };
  }
}
