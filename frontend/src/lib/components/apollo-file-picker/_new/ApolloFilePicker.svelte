<script lang="ts">
  import { tick } from 'svelte';
  import TablerIcon from '$lib/components/TablerIcon.svelte';
  import ApolloFilePickerState, {
    type FilePickerDataSource,
    type FsEntry,
    type PickerMode,
  } from './ApolloFilePickerState.svelte.js';
  import DirectoryTree from './DirectoryTree.svelte';
  import FileList from './FileList.svelte';
  import FileListToolbar from './FileListToolbar.svelte';
  import FileSystemSelect from './FileSystemSelect.svelte';

  type ResolvedEntry = { name: string, uri: string, isDirectory: boolean };

  let { mode = 'any', dataSource, onResolve }: {
    /** Which kind of entry may be confirmed: `'file'`, `'directory'`, or either (`'any'`). */
    mode?: PickerMode,
    /** Override the data source (defaults to the oRPC backend). Used by the demo/tests. */
    dataSource?: FilePickerDataSource,
    onResolve: (entry: ResolvedEntry) => void,
  } = $props();

  // svelte-ignore state_referenced_locally
  const controller = new ApolloFilePickerState(dataSource);
  $effect(() => {
    controller.mode = mode;
  });

  let dialogRef: HTMLDialogElement;
  let fileListRef = $state<{ focus: () => void }>();
  let initPromise: Promise<void> | null = $state(null);

  const confirmLabel = $derived(
    mode === 'file' ? 'Select file' : mode === 'directory' ? 'Select directory' : 'Select',
  );

  const dialogLabel = $derived(
    mode === 'file' ? 'Choose a file' : mode === 'directory' ? 'Choose a folder' : 'Choose a file or folder',
  );

  export function show(): void {
    hide();
    controller.highlight(null); // start each session targeting the current folder, not a stale pick
    dialogRef.showModal();
    // showModal() inerts background interaction but not scrolling — lock the page scroll too.
    document.documentElement.style.overflow = 'hidden';
    initPromise ??= controller.init();
    void focusFileListWhenReady();
  }

  // The dialog body renders after the async init resolves; move initial focus to the file list
  // once it's on screen (APG: a dialog should place focus on a sensible element inside it).
  async function focusFileListWhenReady(): Promise<void> {
    await initPromise;
    await tick();
    if (dialogRef?.open) {
      fileListRef?.focus();
    }
  }

  export function hide(): void {
    dialogRef?.close();
  }

  function onDialogClose(): void {
    document.documentElement.style.overflow = '';
  }

  function resolveAndClose(entry: ResolvedEntry): void {
    onResolve({ name: entry.name, uri: entry.uri, isDirectory: entry.isDirectory });
    hide();
  }

  function onListOpen(entry: FsEntry): void {
    if (entry.isDirectory) {
      void controller.navigateTo(entry.uri);
    } else {
      resolveAndClose(entry);
    }
  }

  function onConfirm(): void {
    if (controller.target != null && controller.canConfirm) {
      resolveAndClose(controller.target);
    }
  }
</script>

<dialog class="file-picker" bind:this={dialogRef} aria-label={dialogLabel} closedby="closerequest" onclose={onDialogClose}>
  {#await initPromise}
    <div class="picker-loading"><TablerIcon icon="loader-2" spin /> Loading…</div>
  {:then _}
    <div class="picker-body">
      <aside class="sidebar">
        <FileSystemSelect
          fileSystems={controller.allFileSystems}
          currentUri={controller.currentFileSystem?.uri ?? null}
          onChange={(uri) => void controller.selectFileSystem(uri)}
        />
        <DirectoryTree {controller} />
      </aside>

      <section class="main">
        <FileListToolbar
          breadcrumbs={controller.breadcrumbs}
          rootUri={controller.currentFileSystem?.uri ?? ''}
          loading={controller.isLoadingDir}
          onNavigate={(uri) => void controller.navigateTo(uri)}
          onRefresh={() => void controller.refresh()}
          sortKey={controller.sortKey}
          sortDir={controller.sortDir}
          onSort={(key, dir) => controller.setSort(key, dir)}
        />
        <div class="list-scroll">
          <FileList
            bind:this={fileListRef}
            entries={controller.entries}
            highlightedUri={controller.highlightedUri}
            loading={controller.isLoadingDir}
            onHighlight={(uri) => controller.highlight(uri)}
            onOpen={onListOpen}
          />
        </div>
      </section>
    </div>

    <footer class="picker-footer">
      <button type="button" class="btn-primary" disabled={!controller.canConfirm || controller.isLoadingDir} onclick={onConfirm}>
        {confirmLabel}
      </button>
      <button type="button" class="btn-secondary" onclick={() => hide()}>Cancel</button>
    </footer>
  {:catch error}
    <p class="picker-error"><strong>Failed to load:</strong> {error.message}</p>
  {/await}
</dialog>

<style>
  .file-picker {
    --fp-bg:          #14161d;
    --fp-surface:     #181b23;
    --fp-surface-2:   #1f2330;
    --fp-border:      #2b2f3a;
    --fp-text:        #eef0f6;
    --fp-text-muted:  #8b90a0;
    --fp-accent:      #5b8cff;
    --fp-accent-soft: #1d2742;
    --fp-folder:      #d9bd7a;
  }

  .file-picker:open {
    box-sizing:         border-box;
    display:            grid;
    grid-template-rows: minmax(0, 1fr) auto;
    width:              min(70rem, 94vw);
    height:             min(42rem, 88vh);
    padding:            0;
    border:             none;
    border-radius:      0.85rem;
    background-color:   var(--fp-bg);
    color:              var(--fp-text);
    overflow:           clip;
    box-shadow:         0 1.5rem 4rem rgb(0 0 0 / 0.55);
    font-family:        system-ui, sans-serif;
  }

  .file-picker::backdrop {
    background-color: rgb(0 0 0 / 0.55);
    backdrop-filter:  blur(2px);
  }

  .picker-loading {
    display:         flex;
    align-items:     center;
    justify-content: center;
    gap:             0.5rem;
    height:          100%;
    color:           var(--fp-text-muted);
  }

  .picker-error {
    padding: 2rem;
  }

  .picker-body {
    display:               grid;
    grid-template-columns: minmax(15rem, 20rem) minmax(0, 1fr);
    min-height:            0;
  }

  .sidebar {
    display:        flex;
    flex-direction: column;
    min-height:     0;
    border-right:   1px solid var(--fp-border);
    background-color: var(--fp-surface);
  }

  .main {
    display:        flex;
    flex-direction: column;
    min-height:     0;
    min-width:      0;
  }

  .list-scroll {
    flex:       1 1 0;
    min-height: 0;
  }

  .picker-footer {
    display:          flex;
    justify-content:  flex-end;
    gap:              0.5rem;
    padding:          0.75rem 1rem;
    border-top:       1px solid var(--fp-border);
    background-color: var(--fp-surface);
  }

  .btn-secondary,
  .btn-primary {
    padding:       0.5rem 1.15rem;
    border-radius: 0.5rem;
    font:          inherit;
    font-weight:   500;
    cursor:        pointer;
  }

  .btn-secondary {
    border:           1px solid var(--fp-border);
    background-color: transparent;
    color:            var(--fp-text);
  }

  .btn-secondary:hover {
    background-color: var(--fp-surface-2);
  }

  .btn-primary {
    border:           1px solid var(--fp-accent);
    background-color: var(--fp-accent);
    color:            #0b1020;
  }

  .btn-primary:hover:not(:disabled) {
    filter: brightness(1.08);
  }

  .btn-primary:disabled {
    opacity:          0.45;
    cursor:           not-allowed;
    background-color: var(--fp-surface-2);
    border-color:     var(--fp-border);
    color:            var(--fp-text-muted);
  }

  .btn-secondary:focus-visible,
  .btn-primary:focus-visible {
    outline:        2px solid var(--fp-accent);
    outline-offset: 2px;
  }
</style>
