import { getClientSideRpcClient } from '$lib/oRPCClientSide';
import type { ORpcContractOutputs } from '$lib/ORpcHelper';

type StartResult = ORpcContractOutputs['files']['filePicker']['start'];
type DirResult = ORpcContractOutputs['files']['filePicker']['openDirectory'];

/** A single entry in the file list (file or directory), with metadata used for sorting. */
export type FsEntry = DirResult['currentDirectory']['files'][number];
/** A filesystem available in the filesystem `<select>`. */
export type FileSystemInfo = StartResult['allFileSystems'][number];
/** One breadcrumb segment (a directory along the current path). */
export type Breadcrumb = DirResult['currentDirectory']['breadcrumbs'][number];
/** Minimal directory reference used to feed the directory tree. */
export type DirRef = { name: string, uri: string };

export type SortKey = 'name' | 'modified';
export type SortDir = 'asc' | 'desc';
export type PickerMode = 'file' | 'directory' | 'any';

const SORT_STORAGE_KEY = 'apollo_filePickerSort';
const SORT_KEYS: readonly SortKey[] = ['name', 'modified'];
const SORT_DIRS: readonly SortDir[] = ['asc', 'desc'];

/** Load the persisted sort preference, falling back to name/ascending (SSR, missing, or invalid). */
function readStoredSort(): { key: SortKey, dir: SortDir } {
  const fallback = { key: 'name' as SortKey, dir: 'asc' as SortDir };
  if (typeof localStorage === 'undefined') {
    return fallback;
  }
  try {
    const raw = localStorage.getItem(SORT_STORAGE_KEY);
    if (raw == null) {
      return fallback;
    }
    const parsed = JSON.parse(raw);

    if (SORT_KEYS.includes(parsed?.key) && SORT_DIRS.includes(parsed?.dir)) {
      return {
        key: SORT_KEYS.includes(parsed?.key) ? parsed.key : fallback.key,
        dir: SORT_DIRS.includes(parsed?.dir) ? parsed.dir : fallback.dir,
      };
    }

    return fallback;
  } catch {
    return fallback;
  }
}

function writeStoredSort(key: SortKey, dir: SortDir): void {
  if (typeof localStorage === 'undefined') {
    return;
  }
  try {
    localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify({ key, dir }));
  } catch {
    // ignore storage quota / availability errors
  }
}

/**
 * Abstracts where directory data comes from so the picker can run against the real backend
 * (see {@link createORpcDataSource}) or an in-memory mock (demo / tests) without auth.
 */
export interface FilePickerDataSource {
  /** Open the picker, optionally anchored at `startUri` (a directory, or a file whose parent opens). */
  start(startUri?: string): Promise<StartResult>;

  openDirectory(uri: string): Promise<DirResult>;
}

/** The default data source: the oRPC `files.filePicker` procedures. */
export function createORpcDataSource(): FilePickerDataSource {
  return {
    start: (startUri) => getClientSideRpcClient().files.filePicker.start(startUri != null ? { startUri } : undefined),
    openDirectory: (uri) => getClientSideRpcClient().files.filePicker.openDirectory({ uri }),
  };
}

/**
 * Owns all file-picker data and interaction state. UI components stay dumb and read/drive
 * this controller. Every navigation / directory listing re-fetches fresh data; the directory
 * tree reuses already-loaded nodes for "locate" via its own per-node child cache.
 */
export default class ApolloFilePickerState {
  private readonly dataSource: FilePickerDataSource;
  private readonly collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

  /** Which kind of entry may be confirmed. Set by the host component. */
  mode = $state<PickerMode>('any');

  private _allFileSystems = $state<FileSystemInfo[]>([]);
  private _currentFileSystem = $state<DirResult['currentFileSystem'] | null>(null);
  private _currentDirectory = $state<{ name: string, uri: string, breadcrumbs: Breadcrumb[] } | null>(null);
  private _currentFiles = $state<FsEntry[]>([]);

  private _highlightedUri = $state<string | null>(null);
  private _sortKey = $state<SortKey>('name');
  private _sortDir = $state<SortDir>('asc');

  /** Whether a directory navigation fetch is currently in flight. */
  private _loading = $state(false);

  /**
   * Shared directory cache (uri → full `openDirectory` result), keyed by the globally-unique
   * directory uri. Written by both {@link navigateTo} and {@link listDirectories} so the list and
   * tree reuse each other's fetches. Powers stale-while-revalidate on navigation.
   */
  private readonly cache = new Map<string, DirResult>();

  /** Monotonic navigation counter; only the latest navigation's async result is applied. */
  private navSeq = 0;

  constructor(dataSource: FilePickerDataSource = createORpcDataSource()) {
    this.dataSource = dataSource;

    const stored = readStoredSort();
    this._sortKey = stored.key;
    this._sortDir = stored.dir;
  }

  /* ---- reads ---- */

  get allFileSystems(): ReadonlyArray<FileSystemInfo> {
    return this._allFileSystems;
  }

  get currentFileSystem(): DirResult['currentFileSystem'] | null {
    return this._currentFileSystem;
  }

  get currentDirectory(): Readonly<{ name: string, uri: string }> | null {
    return this._currentDirectory;
  }

  get breadcrumbs(): ReadonlyArray<Breadcrumb> {
    return this._currentDirectory?.breadcrumbs ?? [];
  }

  /** Root nodes for the directory tree (the directories at the filesystem root, name-sorted). */
  get treeRoots(): DirRef[] {
    return (this._currentFileSystem?.directoriesAtRoot ?? [])
      .map((d) => ({ name: d.name, uri: d.uri }))
      .sort((a, b) => this.collator.compare(a.name, b.name));
  }

  get highlightedUri(): string | null {
    return this._highlightedUri;
  }

  get sortKey(): SortKey {
    return this._sortKey;
  }

  get sortDir(): SortDir {
    return this._sortDir;
  }

  /** True while a directory navigation is fetching fresh data (revalidating or first load). */
  get isLoadingDir(): boolean {
    return this._loading;
  }

  /** Current directory's entries, directories first, then sorted within each group. */
  private readonly _entries = $derived.by(() => {
    const directories = this._currentFiles.filter((f) => f.isDirectory);
    const files = this._currentFiles.filter((f) => !f.isDirectory);
    this.sortInPlace(directories);
    this.sortInPlace(files);
    return [...directories, ...files];
  });

  get entries(): ReadonlyArray<FsEntry> {
    return this._entries;
  }

  /** The entry that would be returned on confirm: the highlighted one, else the current folder. */
  private readonly _target = $derived.by((): FsEntry | null => {
    if (this._highlightedUri != null) {
      const found = this._currentFiles.find((f) => f.uri === this._highlightedUri);
      if (found != null) {
        return found;
      }
    }

    const directory = this._currentDirectory;
    if (directory == null) {
      return null;
    }

    return { name: directory.name, uri: directory.uri, isDirectory: true, lastModified: 0, sizeBytes: 0 };
  });

  get target(): FsEntry | null {
    return this._target;
  }

  private readonly _canConfirm = $derived.by(() => {
    const target = this._target;
    if (target == null) {
      return false;
    }
    if (this.mode === 'any') {
      return true;
    }
    return this.mode === 'file' ? !target.isDirectory : target.isDirectory;
  });

  get canConfirm(): boolean {
    return this._canConfirm;
  }

  /* ---- actions ---- */

  /**
   * (Re)open the picker. With `startUri`, the backend anchors at that directory (or, for a file, its
   * parent directory) and may return a `selectedUri` to pre-select; otherwise it opens the default root.
   */
  async open(startUri?: string): Promise<void> {
    const data = await this.dataSource.start(startUri);
    this._allFileSystems = data.allFileSystems;
    this.applyDirResult(data);
    this._highlightedUri = data.selectedUri ?? null;
  }

  selectFileSystem(fileSystemUri: string): Promise<void> {
    this.cache.clear(); // drop cached listings from the previous filesystem
    // Reset to the target filesystem with no contents yet, so the tree, list and breadcrumbs
    // clear immediately instead of showing the previous filesystem while the new one loads.
    const fileSystem = this._allFileSystems.find((fs) => fs.uri === fileSystemUri);
    this._currentFileSystem = fileSystem != null ? { ...fileSystem, directoriesAtRoot: [] } : null;
    this._currentDirectory = null;
    return this.navigateTo(fileSystemUri);
  }

  /**
   * Navigate into a directory using stale-while-revalidate: show cached contents instantly (if any),
   * always re-fetch in the background, then swap in fresh data. Clears the highlight. Out-of-order
   * responses are discarded via {@link navSeq}.
   */
  async navigateTo(uri: string): Promise<void> {
    const seq = ++this.navSeq;
    this._highlightedUri = null;

    const cached = this.cache.get(uri);
    if (cached != null) {
      this.applyDirResult(cached); // stale: list + breadcrumbs + filesystem from cache
    } else {
      this._currentFiles = []; // nothing cached → clear so the list shows a centered spinner
    }

    this._loading = true;
    try {
      const fresh = await this.dataSource.openDirectory(uri);
      if (seq !== this.navSeq) {
        return; // superseded by a newer navigation
      }
      this.cache.set(uri, fresh);
      this.applyDirResult(fresh);
    } finally {
      if (seq === this.navSeq) {
        this._loading = false;
      }
    }
  }

  /**
   * The parent directory of the current one, or `null` when already at the filesystem root.
   * Breadcrumbs run root-most → current with the current directory as the last entry and the
   * filesystem root excluded, so the parent is the second-to-last crumb, or the root itself when
   * the current directory is a direct child of root.
   */
  get parentUri(): string | null {
    const breadcrumbs = this._currentDirectory?.breadcrumbs ?? [];
    if (breadcrumbs.length >= 2) {
      return breadcrumbs[breadcrumbs.length - 2].uri;
    }
    if (breadcrumbs.length === 1) {
      return this._currentFileSystem?.uri ?? null;
    }
    return null;
  }

  /** Navigate to the parent directory (no-op at root), highlighting the folder we came from. */
  async navigateToParent(): Promise<void> {
    const parent = this.parentUri;
    if (parent == null) {
      return;
    }
    const childUri = this._currentDirectory?.uri ?? null;
    await this.navigateTo(parent);
    if (childUri != null) {
      this.highlight(childUri);
    }
  }

  /** Re-fetch the current directory (revalidates while keeping current contents visible). */
  async refresh(): Promise<void> {
    const current = this._currentDirectory;
    if (current == null) {
      return;
    }
    await this.navigateTo(current.uri);
  }

  /** Fresh listing of a directory's sub-directories (name-sorted) — used by the tree's `loadChildren`. */
  async listDirectories(uri: string): Promise<DirRef[]> {
    const data = await this.dataSource.openDirectory(uri);
    this.cache.set(uri, data); // share with the list's cache
    return data.currentDirectory.files
      .filter((f) => f.isDirectory)
      .map((f) => ({ name: f.name, uri: f.uri }))
      .sort((a, b) => this.collator.compare(a.name, b.name));
  }

  highlight(uri: string | null): void {
    this._highlightedUri = uri;
  }

  setSort(key: SortKey, dir: SortDir): void {
    this._sortKey = key;
    this._sortDir = dir;
    writeStoredSort(key, dir);
  }

  /* ---- internals ---- */

  private applyDirResult(data: DirResult): void {
    this._currentFileSystem = data.currentFileSystem;
    this._currentDirectory = {
      name: data.currentDirectory.name,
      uri: data.currentDirectory.uri,
      breadcrumbs: data.currentDirectory.breadcrumbs,
    };
    this._currentFiles = data.currentDirectory.files;
  }

  private sortInPlace(list: FsEntry[]): void {
    const direction = this._sortDir === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      const comparison = this._sortKey === 'name'
        ? this.collator.compare(a.name, b.name)
        : a.lastModified - b.lastModified;
      return comparison * direction;
    });
  }
}
