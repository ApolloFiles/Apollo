<script lang="ts">
  import { goto } from '$app/navigation';
  import TablerIcon from '$lib/components/TablerIcon.svelte';
  import { getClientSideRpcClient } from '$lib/oRPCClientSide';
  import { getUserProfile } from '$lib/stores/UserProfileStore.svelte';

  let { data } = $props();

  const isCreateMode = $derived(data.createMode);

  // svelte-ignore state_referenced_locally
  let editValueName: string = $state(data.library.name);
  // svelte-ignore state_referenced_locally
  let editValueDirectoryUris: string[] = $state(data.library.directoryUris);
  // svelte-ignore state_referenced_locally
  let editValueSharedWithUserIds: { id: string, displayName: string }[] = $state(data.library.sharedWith);

  let searchQuery = $state('');
  let searchResults = $state<{ id: string, displayName: string }[]>([]);
  let searchDebounceTimer: number;

  function searchUsersToShareWith(query: string): Promise<{ id: string, displayName: string }[]> {
    return getClientSideRpcClient().media.management.searchUserToShareWith({ searchQuery: query });
  }

  function handleSearchInput() {
    window.clearTimeout(searchDebounceTimer);
    if (!searchQuery.trim()) {
      searchResults = [];
      return;
    }

    searchDebounceTimer = window.setTimeout(async () => {
      searchResults = await searchUsersToShareWith(searchQuery);
    }, 300);
  }

  function selectUser(user: { id: string, displayName: string }) {
    // Check if already added
    if (!editValueSharedWithUserIds.find(u => u.id === user.id)) {
      editValueSharedWithUserIds.push(user);
    }
    searchQuery = '';
    searchResults = [];
  }

  async function saveChanges(): Promise<void> {
    const payload = {
      name: editValueName,
      directoryUris: editValueDirectoryUris.filter(uri => uri.trim().length > 0),
      sharedWithUserIds: editValueSharedWithUserIds.map(u => u.id),
    };

    try {
      if (isCreateMode) {
        await getClientSideRpcClient()
          .media
          .management
          .createLibrary(payload);
      } else {
        await getClientSideRpcClient()
          .media
          .management
          .updateLibrary({
            ...payload,
            id: data.library.id,
          });
      }

      return redirectToManagePage();
    } catch (err) {
      console.error(err);
      alert('Error saving changes: ' + (err as any).message);
    }
  }

  async function redirectToManagePage(): Promise<void> {
    await goto('/media/manage');
  }
</script>

<div class="page-container">
  <header>
    <h1>{isCreateMode ? 'Create' : 'Edit'} Media Library</h1>
  </header>

  <main>
    <form class="library-form" onsubmit={(event) => event.preventDefault()}>
      <div class="form-group">
        <label for="lib-name">Name</label>
        <input
          type="text"
          bind:value={editValueName}
          required
          placeholder="e.g. My Movies"
          class="form-control"
        />
      </div>

      <div class="form-group">
        <p class="p-label">Directory Paths</p>
        {#if editValueDirectoryUris.length > 0}
          <ul class="directory-list">
            {#each editValueDirectoryUris as _uri, index}
              <li class="directory-item">
                <input
                  type="text"
                  bind:value={editValueDirectoryUris[index]}
                  required
                  placeholder="Full ApolloURL needed right now (e.g. apollo:///f/{getUserProfile().id}/default/my-media/)"
                  class="form-control"
                />
                <button type="button" onclick={() => editValueDirectoryUris.splice(index, 1)} class="icon-btn danger">
                  <TablerIcon icon="trash" />
                </button>
              </li>
            {/each}
          </ul>
        {/if}
        <button type="button" onclick={() => editValueDirectoryUris.push('')} class="add-btn text-sm">
          <TablerIcon icon="plus" />
          Add Path
        </button>
      </div>

      <div class="form-group">
        <p class="p-label">Shared With</p>
        {#if editValueSharedWithUserIds.length > 0}
          <ul class="user-list">
            {#each editValueSharedWithUserIds as _uri, index}
              <li class="user-item">
                <div class="user-info">
                  <img
                    src="/api/_frontend/user/{encodeURIComponent(editValueSharedWithUserIds[index].id)}/picture.png"
                    alt=""
                    role="presentation"
                    class="user-avatar"
                  >

                  <div>
                    <strong>{editValueSharedWithUserIds[index].displayName}</strong>
                    <br>
                    <small class="text-muted">{editValueSharedWithUserIds[index].id}</small>
                  </div>
                </div>
                <button
                  type="button"
                  onclick={() => editValueSharedWithUserIds.splice(index, 1)}
                  class="icon-btn danger">
                  <TablerIcon icon="trash" />
                </button>
              </li>
            {/each}
          </ul>
        {/if}

        <div class="user-search-container">
          <input
            type="text"
            bind:value={searchQuery}
            oninput={handleSearchInput}
            placeholder="Search User ID or Name..."
            class="form-control"
          />

          {#if searchResults.length > 0}
            <ul class="search-results-dropdown">
              {#each searchResults as user}
                <li>
                  <button type="button" class="search-result-item" onclick={() => selectUser(user)}>
                    <img
                      src="/api/_frontend/user/{encodeURIComponent(user.id)}/picture.png"
                      alt=""
                      class="user-avatar small"
                    />
                    <span class="search-user-text">
                      <span class="d-block">{user.displayName}</span>
                      <small class="text-muted">{user.id}</small>
                    </span>
                  </button>
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      </div>

      <div class="form-actions right">
        <button type="button" onclick={redirectToManagePage} class="btn btn-secondary">Cancel</button>
        <button type="submit" onclick={saveChanges} class="btn btn-primary">Save</button>
      </div>
    </form>
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

  /* Form View */
  .library-form {
    background:    rgba(255, 255, 255, 0.02);
    padding:       2rem;
    border-radius: 12px;
    border:        1px solid rgba(255, 255, 255, 0.05);
  }

  .form-group {
    display:        flex;
    flex-direction: column;
    gap:            10px;
    margin-bottom:  24px;
  }

  label, .p-label {
    font-size:   0.95rem;
    font-weight: 500;
    color:       var(--text-secondary, #ccc);
  }

  .form-control {
    background:    rgba(0, 0, 0, 0.3);
    border:        1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    padding:       12px;
    color:         white;
    font-size:     1rem;
    transition:    border-color 0.2s;
  }

  .form-control:focus {
    outline:      none;
    border-color: var(--primary-color, #3b82f6);
  }

  .directory-list {
    display:        flex;
    flex-direction: column;
    gap:            10px;
    list-style:     none;
    padding:        0;
  }

  .directory-item {
    display: flex;
    gap:     10px;
  }

  .directory-item input {
    flex: 1;
  }

  .add-btn {
    align-self:    flex-start;
    border:        1px dashed rgba(255, 255, 255, 0.3);
    margin-top:    5px;
    background:    none;
    color:         var(--text-secondary, #ccc);
    padding:       8px;
    border-radius: 6px;
    cursor:        pointer;
    display:       flex;
    align-items:   center;
    gap:           6px;
  }

  .add-btn:hover {
    border-color: var(--primary-color, #3b82f6);
    color:        var(--primary-color, #3b82f6);
  }

  .user-list {
    max-height:    200px;
    overflow-y:    auto;
    background:    rgba(0, 0, 0, 0.3);
    border:        1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    padding:       10px;
  }

  .user-item {
    display:       flex;
    align-items:   center;
    gap:           12px;
    padding:       8px;
    cursor:        pointer;
    border-radius: 6px;
    transition:    background 0.1s;
  }

  .user-item:hover {
    background: rgba(255, 255, 255, 0.05);
  }

  .user-info {
    display:      flex;
    align-items:  center;
    gap:          12px;
    margin-right: auto;
  }

  .user-avatar {
    width:         32px;
    height:        32px;
    border-radius: 50%;
    object-fit:    cover;
    aspect-ratio:  1;
    border:        2px solid transparent;
    transition:    border-color 0.2s;
  }

  .user-item:hover .user-avatar {
    border-color: var(--text-primary, #e0e0e0);
  }

  .form-actions {
    display:         flex;
    justify-content: flex-end;
    gap:             15px;
    margin-top:      30px;
    padding-top:     20px;
    border-top:      1px solid rgba(255, 255, 255, 0.1);
  }

  .btn {
    padding:       12px 24px;
    border-radius: 8px;
    font-weight:   600;
    font-size:     1rem;
    cursor:        pointer;
    border:        none;
  }

  .btn-secondary {
    background: rgba(255, 255, 255, 0.1);
    color:      white;
  }

  .btn-secondary:hover {
    background: rgba(255, 255, 255, 0.15);
  }

  .btn-primary {
    background: var(--primary-color, #3b82f6);
    color:      white;
  }

  .btn-primary:hover {
    filter: brightness(1.1);
  }

  .icon-btn {
    background:      none;
    border:          none;
    cursor:          pointer;
    color:           var(--text-secondary, #ccc);
    display:         flex;
    align-items:     center;
    justify-content: center;
    padding:         8px;
    border-radius:   6px;
  }

  .icon-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    color:      white;
  }

  .danger {
    color: #ef4444 !important;
  }

  /* User Search Styling */
  .user-search-container {
    position: relative;
  }

  .search-results-dropdown {
    position:      absolute;
    top:           100%;
    left:          0;
    right:         0;
    background:    var(--bg-surface, #1e1e1e); /* Ensure valid background variable or fallback */
    border:        1px solid rgba(255, 255, 255, 0.1);
    border-radius: 0 0 8px 8px;
    list-style:    none;
    padding:       0;
    margin:        0;
    z-index:       10;
    max-height:    200px;
    overflow-y:    auto;
    box-shadow:    0 4px 10px rgba(0, 0, 0, 0.3);
  }

  .search-result-item {
    width:       100%;
    display:     flex;
    align-items: center;
    gap:         12px;
    padding:     10px 12px;
    background:  none;
    border:      none;
    color:       var(--text-primary, #e0e0e0);
    text-align:  left;
    cursor:      pointer;
    transition:  background 0.1s;
  }

  .search-result-item:hover, .search-result-item:focus {
    background: rgba(255, 255, 255, 0.1);
    outline:    none;
  }

  .user-avatar.small {
    width:  24px;
    height: 24px;
  }

  .search-user-text {
    display:         flex;
    flex-direction:  column;
    justify-content: center;
    line-height:     1.2;
  }

  .d-block {
    display: block;
  }

  .text-sm {
    font-size: 0.85rem;
  }
</style>
