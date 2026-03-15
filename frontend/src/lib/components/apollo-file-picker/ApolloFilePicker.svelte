<script lang="ts">
  import SidebarTreeNode from '$lib/components/apollo-file-picker/SidebarTreeNode.svelte';
  import TablerIcon from '$lib/components/TablerIcon.svelte';
  import { onMount } from 'svelte';
  import ApolloFilePickerState from './ApolloFilePickerState.svelte.js';

  type FileInfo = { name: string, uri: string };

  let { onResolve }: { onResolve: (file: FileInfo) => void } = $props();

  const filePickerState = new ApolloFilePickerState();

  let dialogElementRef: HTMLDialogElement;
  let filePickerInitPromise: Promise<void> | null = $state(null);
  let selectedFile: FileInfo | null = $state(null);
  let expandedUrisInTree: string[] = $state([]);

  export function show(): void {
    hide();
    dialogElementRef.showModal();
  }

  export function hide(): void {
    dialogElementRef?.close();

    selectedFile = null;
  }

  /* user interactions */

  function onFileSystemSelected(fileSystemUri: string): void {
    selectedFile = null;

    // TODO: show loader until navigation completed
    filePickerState.navigateToDirectory(fileSystemUri)
      .catch((err) => {
        console.error(err);
        alert('Error during directory navigation (check console log)');
      });
  }

  function onBreadcrumbClick(directoryUri: string): void {
    selectedFile = null;

    // TODO: show loader until navigation completed
    filePickerState.navigateToDirectory(directoryUri)
      .catch((err) => {
        console.error(err);
        alert('Error during directory navigation (check console log)');
      });
  }

  function onRefreshClick(): void {
    if (filePickerState.currentDirectory != null) {
      filePickerState.navigateToDirectory(filePickerState.currentDirectory.uri);
    }
  }

  function onFileClicked(file: FileInfo): void {
    selectedFile = file;
  }

  function onFileDoubleClicked(file: { name: string, uri: string, isDirectory: boolean }): void {
    selectedFile = null;

    if (!file.isDirectory) {
      onFileSelected(file);
      return;
    }

    if (!expandedUrisInTree.includes(file.uri)) {
      expandedUrisInTree.push(file.uri);
    }

    // TODO: show loader until navigation completed
    filePickerState.navigateToDirectory(file.uri)
      .catch((err) => {
        console.error(err);
        alert('Error during directory navigation (check console log)');
      });
  }

  function onFileSelected(file: { name: string, uri: string }): void {
    hide();
    onResolve(file);
  }

  function onToggleTreeNode(directoryUri: string): void {
    if (expandedUrisInTree.includes(directoryUri)) {
      expandedUrisInTree.splice(expandedUrisInTree.indexOf(directoryUri), 1);
    } else {
      expandedUrisInTree.push(directoryUri);

      // FIXME: tree node children are not automatically updated in the UI after fetching
      filePickerState.fetchDirectoryForTree(directoryUri)
        .catch((err) => {
          console.error(err);
          alert('Error fetching directory (check console log)');
        });
    }
  }

  function onTreeNodeClick(directoryUri: string): void {
    selectedFile = null;

    // TODO: show loader until navigation completed
    filePickerState.navigateToDirectory(directoryUri)
      .catch((err) => {
        console.error(err);
        alert('Error during directory navigation (check console log)');
      });
  }

  onMount(() => {
    filePickerInitPromise = filePickerState.init();
  });
</script>

<dialog class="apollo-file-picker" bind:this={dialogElementRef} closedby="closerequest">
  {#await filePickerInitPromise}
    <TablerIcon icon="loader-2" spin={true} />
  {:then _}
    <!-- search -->
    <header class="picker-header">
      <label class="search-wrap">
        <span class="sr-only">Search</span>
        <input
          type="search"
          placeholder="Search files or folders"
          disabled
          title="Search is not implemented yet"
          style="cursor: not-allowed"
        />
      </label>
    </header>

    <section class="picker-content">
      <aside class="sidebar-pane">
        <!-- file system select -->
        <div class="drive-select-wrap">
          <label for="picker-drive-select">File system</label>
          <select id="picker-drive-select" onchange={(event) => onFileSystemSelected(event.currentTarget.value)}>
            {#each filePickerState.allFileSystems as fileSystem}
              <option
                value={fileSystem.uri}
                selected={filePickerState.currentFileSystem?.uri === fileSystem.uri}
              >{fileSystem.displayName}</option>
            {/each}
          </select>
        </div>

        <div class="sidebar-tree-scroll">
          <ul class="sidebar-tree">
            {#each filePickerState.getDirectoriesForTree(null) as directory}
              <SidebarTreeNode
                label={directory.name}
                uri={directory.uri}
                depth={0}

                currentlyVisibleDirectoryUri={filePickerState.currentDirectory?.uri}
                expandedUris={expandedUrisInTree}

                navigateToDirectory={(uri) => onTreeNodeClick(uri)}
                toggleExpand={(uri) => onToggleTreeNode(uri)}
                getChildren={(uri) => filePickerState.getDirectoriesForTree(uri)}
              />
            {/each}
          </ul>
        </div>
      </aside>

      <section class="directory-pane">
        <div class="directory-toolbar">
          <!-- breadcrumbs -->
          <nav class="breadcrumbs" aria-label="Path">
            <button
              type="button"
              class="crumb"
              onclick={() => filePickerState.currentFileSystem != null ? onBreadcrumbClick(filePickerState.currentFileSystem.uri) : undefined}
            ><img
              src="/logo.svg"
              height="24"
              width="24"
              style="vertical-align: text-top"
              alt=""
              role="presentation"
            ></button>
            {#each filePickerState.breadcrumbs as breadcrumb}
              <TablerIcon icon="chevron-right" />
              <button
                type="button"
                class="crumb"
                onclick={() => onBreadcrumbClick(breadcrumb.uri)}
              >{breadcrumb.name}</button>
            {/each}
          </nav>

          <!-- directory buttons -->
          <div class="view-actions">
            <button type="button" onclick={() => onRefreshClick()}>
              <TablerIcon icon="refresh" />
            </button>
          </div>
        </div>

        <!-- file list -->
        <div class="directory-list-scroll">
          <ul class="directory-list">
            {#each filePickerState.currentFiles as file}
              <li>
                <button
                  type="button"
                  class="directory-entry"
                  class:selected={selectedFile?.uri === file.uri}
                  onclick={() => onFileClicked(file)}
                  ondblclick={() => onFileDoubleClicked(file)}
                >
                  <span class="entry-name">
                    {#if file.isDirectory}
                      <TablerIcon icon="folder-open" />
                    {:else}
                      <TablerIcon icon="file" />
                    {/if}
                    {file.name}
                  </span>
                </button>
              </li>
            {/each}
          </ul>
        </div>
      </section>
    </section>

    <footer class="picker-footer">
      <button
        type="button"
        class="btn-open"
        disabled={selectedFile == null}
        onclick={() => selectedFile != null ? onFileSelected(selectedFile) : undefined}
      >Open
      </button>
      <button type="button" class="btn-cancel" onclick={() => hide()}>Cancel</button>
    </footer>
  {:catch error}
    <p>
      <strong>An error occurred:</strong>
      <br>
      <em>{error.message}</em>
    </p>
  {/await}
</dialog>

<style>
  .apollo-file-picker:open {
    box-sizing:         border-box;
    display:            grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    gap:                0.75rem;
    width:              min(72rem, 94vw);
    height:             min(44rem, 86vh);
    padding:            1rem;
    border:             1px solid #2c2c2c;
    border-radius:      0.75rem;
    background-color:   #171717;
    color:              #e8e8e8;
    overflow:           clip;
  }

  .apollo-file-picker:focus-visible {
    outline: none;
  }

  .apollo-file-picker[open] {
    overflow: clip;
  }

  .picker-header {
    display:     flex;
    align-items: center;
    gap:         0.75rem;
  }

  .search-wrap {
    flex:      1 1 0;
    min-width: 0;
  }

  .search-wrap input {
    box-sizing:       border-box;
    width:            100%;
    padding:          0.625rem 0.75rem;
    border:           1px solid #393939;
    border-radius:    0.5rem;
    background-color: #111;
    color:            #f5f5f5;
    font:             inherit;
  }

  .picker-content {
    display:               grid;
    grid-template-columns: minmax(16rem, 22rem) minmax(0, 1fr);
    gap:                   0.75rem;
    height:                100%;
    min-height:            0;
    min-width:             0;
  }

  .sidebar-pane,
  .directory-pane {
    display:          flex;
    flex-direction:   column;
    min-height:       0;
    min-width:        0;
    border:           1px solid #303030;
    border-radius:    0.5rem;
    background-color: #111;
  }

  .drive-select-wrap {
    display:        grid;
    gap:            0.35rem;
    padding:        0.75rem;
    border-bottom:  1px solid #2d2d2d;
    text-transform: uppercase;
    font-size:      0.75rem;
    letter-spacing: 0.02em;
  }

  .drive-select-wrap select {
    padding:          0.5rem;
    border:           1px solid #3a3a3a;
    border-radius:    0.4rem;
    background-color: #171717;
    color:            #ebebeb;
    font:             inherit;
  }

  .sidebar-tree-scroll,
  .directory-list-scroll {
    min-height: 0;
    overflow:   auto;
  }

  .sidebar-tree {
    list-style: none;
    margin:     0;
    padding:    0.5rem;
  }

  .crumb,
  .view-actions button,
  .directory-entry {
    border:           1px solid transparent;
    background-color: transparent;
    color:            inherit;
    font:             inherit;
  }

  .directory-toolbar {
    display:               grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items:           center;
    gap:                   0.75rem;
    padding:               0.75rem;
    border-bottom:         1px solid #2d2d2d;
  }

  .breadcrumbs {
    display:     flex;
    align-items: center;
    overflow-x:  auto;
    white-space: nowrap;
  }

  .crumb {
    padding:       0.35rem 0.45rem;
    border-radius: 0.35rem;
    cursor:        pointer;
  }

  .crumb:hover {
    background-color: #202020;
  }

  .view-actions {
    display: flex;
    gap:     0.45rem;
  }

  .view-actions button {
    padding:          0.38rem 0.6rem;
    border:           1px solid #3b3b3b;
    border-radius:    0.35rem;
    background-color: #1a1a1a;
    cursor:           pointer;
  }

  .view-actions button:hover {
    background-color: #262626;
  }

  .directory-list {
    list-style: none;
    margin:     0;
    padding:    0.5rem;
    display:    grid;
    gap:        0.35rem;
  }

  .directory-entry {
    width:            100%;
    display:          flex;
    justify-content:  space-between;
    gap:              0.75rem;
    padding:          0.55rem 0.7rem;
    border-radius:    0.4rem;
    background-color: #171717;
    text-align:       left;
    cursor:           pointer;
  }

  .directory-entry:hover {
    background-color: #232323;
  }

  .directory-entry.selected {
    border-color:     #5e8bff;
    background-color: #1c2b4f;
  }

  .entry-name {
    white-space:   nowrap;
    overflow:      hidden;
    text-overflow: ellipsis;
  }

  .sr-only {
    position:    absolute;
    width:       1px;
    height:      1px;
    margin:      -1px;
    padding:     0;
    border:      0;
    overflow:    hidden;
    clip:        rect(0, 0, 0, 0);
    white-space: nowrap;
  }

  .picker-footer {
    display:         flex;
    justify-content: flex-end;
    align-items:     center;
    gap:             0.5rem;
    padding-top:     0.25rem;
    border-top:      1px solid #2c2c2c;
  }

  .btn-cancel,
  .btn-open {
    padding:       0.5rem 1.1rem;
    border-radius: 0.4rem;
    font:          inherit;
    cursor:        pointer;
  }

  .btn-cancel {
    border:           1px solid #3b3b3b;
    background-color: #1a1a1a;
    color:            #e8e8e8;
  }

  .btn-cancel:hover {
    background-color: #262626;
  }

  .btn-open {
    border:           1px solid #5e8bff;
    background-color: #1c2b4f;
    color:            #e8e8e8;
  }

  .btn-open:hover:not(:disabled) {
    background-color: #243566;
    border-color:     #7ba3ff;
  }

  .btn-open:disabled {
    opacity:          0.4;
    cursor:           not-allowed;
    border-color:     #3b3b3b;
    background-color: #1a1a1a;
  }

  ::backdrop {
    background-color: black;
    opacity:          0.4;
  }
</style>
