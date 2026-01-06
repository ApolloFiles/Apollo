<script lang="ts">
  import { refreshAll } from '$app/navigation';
  import TablerIcon from '$lib/components/TablerIcon.svelte';
  import { getClientSideRpcClient } from '$lib/oRPCClientSide';

  let { data } = $props();

  const ownedLibraries = $derived(data.libraries.owned);
  const sharedWithLibraries = $derived(data.libraries.sharedWith);

  async function deleteLibrary(id: string, name: string): Promise<void> {
    if (!confirm(`Are you sure you want to delete '${name}'? This cannot be undone.`)) {
      return;
    }

    try {
      await getClientSideRpcClient().media.management.delete({ libraryId: id });
      await refreshAll();
    } catch (err) {
      console.error(err);
      alert(`Failed to delete library: ${(err as any).message}`);
    }
  }

  async function leaveLibrary(id: string, name: string): Promise<void> {
    if (!confirm(`Are you sure you want to unlink '${name}'? You will no longer have access, unless the owner shares it again.`)) {
      return;
    }

    try {
      await getClientSideRpcClient().media.management.unshareMyselfFromOther({ libraryId: id });
      await refreshAll();
    } catch (err) {
      console.error(err);
      alert(`Failed to unlink library: ${(err as any).message}`);
    }

    await refreshAll();
  }

  async function debugStartFullReIndex(): Promise<void> {
    if (!confirm('Are you sure you want to start a full re-index of all your media libraries? This may take a while.')) {
      return;
    }

    try {
      await getClientSideRpcClient().media.management.debug.startFullReIndex();
      await refreshAll();
    } catch (err) {
      console.error(err);
      alert(`Failed to start re-indexing: ${(err as any).message}`);
    }
  }
</script>

<div class="page-container">
  <header>
    <div class="header-top">
      <h1>Manage Media Libraries</h1>
      <button
        class="debug-btn"
        onclick={debugStartFullReIndex}
        disabled={data.debugReIndexStatus}
        title={data.debugReIndexStatus ? "Indexing in progress. Please reload page later to check status." : "Start a full re-index of all libraries"}
      >
        <TablerIcon icon="refresh" />
        [DEBUG] re-index library contents
      </button>
    </div>
  </header>

  <main>
    <div class="list-view">
      <a href="/media/manage/create" class="create-btn">
        <TablerIcon icon="plus" />
        Create New Library
      </a>

      <section>
        <h3>My Libraries</h3>
        <ul class="library-list">
          {#each ownedLibraries as lib}
            <li>
              <span class="lib-name">{lib.name}</span>
              <div class="actions">
                <a href="/media/manage/{lib.id}" title="Edit" class="icon-btn">
                  <TablerIcon icon="edit" />
                </a>
                <button onclick={() => deleteLibrary(lib.id, lib.name)} title="Delete" class="danger-hover">
                  <TablerIcon icon="trash" />
                </button>
              </div>
            </li>
          {/each}
          {#if ownedLibraries.length === 0}
            <li class="empty-state">No media libraries found</li>
          {/if}
        </ul>
      </section>

      <section>
        <h3>Shared With Me</h3>
        <ul class="library-list">
          {#each sharedWithLibraries as lib}
            <li>
              <span class="lib-name">{lib.name}</span>
              <button onclick={() => leaveLibrary(lib.id, lib.name)} title="Unlink" class="danger-hover">
                <TablerIcon icon="link-off" />
              </button>
            </li>
          {/each}
          {#if sharedWithLibraries.length === 0}
            <li class="empty-state">No shared media libraries</li>
          {/if}
        </ul>
      </section>
    </div>
  </main>
</div>

<style>
  .page-container {
    padding:   2rem;
    max-width: 800px;
    margin:    0 auto;
    color:     var(--text-primary, #e0e0e0);
  }

  header {
    margin-bottom:  2rem;
    border-bottom:  1px solid rgba(255, 255, 255, 0.1);
    padding-bottom: 1rem;
  }

  h1 {
    font-size:   2rem;
    font-weight: 700;
    margin:      0;
  }

  .header-top {
    display:         flex;
    justify-content: space-between;
    align-items:     center;
    gap:             1rem;
    flex-wrap:       wrap;
  }

  .debug-btn {
    background:    rgba(255, 165, 0, 0.1) !important;
    border:        1px solid rgba(255, 165, 0, 0.3) !important;
    color:         orange !important;
    font-size:     0.65rem !important;
    padding:       2px 8px !important;
    border-radius: 4px;
    display:       flex;
    align-items:   center;
    gap:           4px;
    font-family:   monospace;
    cursor:        pointer;
    transition:    all 0.2s;
  }

  .debug-btn:hover:not(:disabled) {
    background:   rgba(255, 165, 0, 0.2) !important;
    border-color: orange !important;
  }

  .debug-btn:disabled {
    opacity: 0.5;
    cursor:  not-allowed;
    filter:  grayscale(1);
  }

  /* List View */
  .create-btn {
    width:           100%;
    padding:         16px;
    background:      var(--primary-color, #3b82f6);
    color:           white;
    border:          none;
    line-height:     normal; /* Fix for anchor tag */
    text-decoration: none; /* Fix for anchor tag */
    border-radius:   8px;
    font-weight:     600;
    font-size:       1.1rem;
    display:         flex;
    align-items:     center;
    justify-content: center;
    gap:             10px;
    cursor:          pointer;
    margin-bottom:   30px;
    transition:      filter 0.2s;
  }

  .create-btn:hover {
    filter: brightness(1.1);
  }

  section {
    margin-bottom: 30px;
  }

  section h3 {
    font-size:      1.1rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color:          var(--text-secondary, #aaa);
    margin-bottom:  15px;
    border-bottom:  1px solid rgba(255, 255, 255, 0.1);
    padding-bottom: 8px;
  }

  .library-list {
    list-style:     none;
    padding:        0;
    margin:         0;
    display:        flex;
    flex-direction: column;
    gap:            10px;
  }

  .library-list li {
    display:         flex;
    justify-content: space-between;
    align-items:     center;
    padding:         15px 20px;
    background:      rgba(255, 255, 255, 0.05);
    border-radius:   8px;
    transition:      background 0.2s;
  }

  .library-list li:hover {
    background: rgba(255, 255, 255, 0.08);
  }

  .library-list li.empty-state {
    justify-content: center;
    color:           var(--text-secondary, #aaa);
    font-style:      italic;
  }

  .lib-name {
    font-weight: 600;
    font-size:   1.1rem;
  }

  .actions {
    display: flex;
    gap:     10px;
  }

  button, .icon-btn {
    background:      none;
    border:          none;
    cursor:          pointer;
    color:           var(--text-secondary, #ccc);
    display:         flex;
    align-items:     center;
    justify-content: center;
    padding:         8px;
    border-radius:   6px;
    transition:      all 0.2s;
  }

  button:hover, .icon-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    color:      white;
  }

  .danger-hover:hover {
    color:      #ef4444;
    background: rgba(239, 68, 68, 0.1);
  }
</style>
