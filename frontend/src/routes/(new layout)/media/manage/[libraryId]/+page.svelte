<script lang="ts">
  import { goto } from '$app/navigation';
  import TablerIcon from '$lib/components/TablerIcon.svelte';
  import { m } from '$lib/paraglide/messages.js';
  import { getClientSideRpcClient } from '$lib/oRPCClientSide';
  import { getUserProfile } from '$lib/stores/UserProfileStore.svelte';

  let { data } = $props();

  const isCreateMode = $derived(data.createMode);
  const canManage = $derived(data.library.canManage);

  // svelte-ignore state_referenced_locally
  let editValueName: string = $state(data.library.name);
  // svelte-ignore state_referenced_locally
  let editValueDirectoryUris: string[] = $state(data.library.canManage ? data.library.directoryUris : []);
  // svelte-ignore state_referenced_locally
  let editValueSharedWithUserIds: { id: string, displayName: string }[] = $state(data.library.canManage ? data.library.sharedWith : []);

  // svelte-ignore state_referenced_locally
  let editValueHideFromOverview: boolean = $state(data.libraryUserPreferences.hideFromOverview);
  // svelte-ignore state_referenced_locally
  let editValueHideFromSidebar: boolean = $state(data.libraryUserPreferences.hideFromSidebar);

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
    const preferences = {
      hideFromOverview: editValueHideFromOverview,
      hideFromSidebar: editValueHideFromSidebar,
    };
    const client = getClientSideRpcClient();

    try {
      if (isCreateMode) {
        const newLibraryId = await client.media.management.createLibrary({
          name: editValueName,
          directoryUris: editValueDirectoryUris.filter(uri => uri.trim().length > 0),
          sharedWithUserIds: editValueSharedWithUserIds.map(u => u.id),
        });
        await client.media.management.updateLibraryUserPreferences({
          libraryId: newLibraryId,
          preferences,
        });
      } else if (canManage) {
        await Promise.all([
          client.media.management.updateLibrary({
            id: data.library.id,
            name: editValueName,
            directoryUris: editValueDirectoryUris.filter(uri => uri.trim().length > 0),
            sharedWithUserIds: editValueSharedWithUserIds.map(u => u.id),
          }),
          client.media.management.updateLibraryUserPreferences({
            libraryId: data.library.id,
            preferences,
          }),
        ]);
      } else {
        await client.media.management.updateLibraryUserPreferences({
          libraryId: data.library.id,
          preferences,
        });
      }

      return redirectToManagePage();
    } catch (err) {
      console.error(err);
      alert(m.page_media_manage_library_save_error({ message: (err as any).message }));
    }
  }

  async function redirectToManagePage(): Promise<void> {
    await goto('/media/manage');
  }
</script>

<svelte:head>
  <title>{m.page_media_manage_library_title()} | Apollo Media</title>
</svelte:head>

<div class="page-container">
  <header>
    <h1>{isCreateMode ? m.page_media_manage_library_heading_create() : canManage ? m.page_media_manage_library_heading_edit() : m.page_media_manage_library_heading_view()}</h1>
  </header>

  <main>
    <form class="library-form" onsubmit={(event) => event.preventDefault()}>
      <div class="form-group">
        <label for="lib-name">{m.page_media_manage_library_field_name()}</label>
        <input
          id="lib-name"
          type="text"
          bind:value={editValueName}
          maxlength="256"
          required
          readonly={!canManage}
          placeholder={m.page_media_manage_library_name_placeholder()}
          class="form-control"
          class:readonly={!canManage}
        />
      </div>

      {#if canManage}
        <div class="form-group">
          <p class="p-label">{m.page_media_manage_library_directory_paths()}</p>
          {#if editValueDirectoryUris.length > 0}
            <ul class="directory-list">
              {#each editValueDirectoryUris as _uri, index}
                <li class="directory-item">
                  <input
                    type="text"
                    bind:value={editValueDirectoryUris[index]}
                    maxlength="500"
                    required
                    placeholder={m.page_media_manage_library_directory_placeholder({ userId: getUserProfile().id })}
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
            {m.page_media_manage_library_add_path()}
          </button>
        </div>

        <div class="form-group">
          <p class="p-label">{m.page_media_manage_library_shared_with()}</p>
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
              maxlength="75"
              oninput={handleSearchInput}
              placeholder={m.page_media_manage_library_search_placeholder()}
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
      {/if}

      <section class="personal-prefs">
        <header class="personal-prefs-header">
          <span class="personal-prefs-badge">
            <TablerIcon icon="user-filled" />
            {m.page_media_manage_library_personal_badge()}
          </span>
          <p class="personal-prefs-subtitle">
            {m.page_media_manage_library_personal_subtitle()}
          </p>
        </header>

        <label class="checkbox-row">
          <input type="checkbox" bind:checked={editValueHideFromOverview} />
          <span>{m.page_media_manage_library_hide_from_overview()}</span>
        </label>
        <label class="checkbox-row">
          <input type="checkbox" bind:checked={editValueHideFromSidebar} />
          <span>{m.page_media_manage_library_hide_from_sidebar()}</span>
        </label>
      </section>

      <div class="form-actions right">
        <button type="button" onclick={redirectToManagePage} class="btn btn-secondary">{m.common_btn_label_cancel()}</button>
        <button type="submit" onclick={saveChanges} class="btn btn-primary">{m.common_btn_label_save()}</button>
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

  .form-control.readonly {
    opacity: 0.7;
    cursor:  default;
  }
  .form-control.readonly:focus {
    border-color: rgba(255, 255, 255, 0.1);
  }

  .personal-prefs {
    position:       relative;
    margin-top:     24px;
    padding:        18px 18px 18px 22px;
    border:         1px solid rgba(255, 255, 255, 0.08);
    border-left:    4px solid var(--primary-color, #3b82f6);
    border-radius:  8px;
    background:     rgba(59, 130, 246, 0.06);
    display:        flex;
    flex-direction: column;
    gap:            12px;
  }

  .personal-prefs-header {
    display:        flex;
    flex-direction: column;
    gap:            4px;
  }

  .personal-prefs-badge {
    display:       inline-flex;
    align-items:   center;
    gap:           6px;
    align-self:    flex-start;
    padding:       2px 10px;
    border-radius: 999px;
    background:    rgba(59, 130, 246, 0.18);
    color:         var(--primary-color, #3b82f6);
    font-size:     0.8rem;
    font-weight:   600;
  }

  .personal-prefs-subtitle {
    margin:    0;
    font-size: 0.85rem;
    color:     var(--text-secondary, #ccc);
  }

  .checkbox-row {
    display:     flex;
    align-items: center;
    gap:         10px;
    cursor:      pointer;
    font-size:   0.95rem;
  }

  .checkbox-row input[type=checkbox] {
    accent-color: var(--primary-color, #3b82f6);
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
