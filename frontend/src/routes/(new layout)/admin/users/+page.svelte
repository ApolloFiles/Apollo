<script lang="ts">
  import TablerIcon from '$lib/components/TablerIcon.svelte';
  import { getClientSideRpcClient } from '$lib/oRPCClientSide';

  let { data } = $props();

  const users = $derived(data.users);

  async function createInviteLink(): Promise<void> {
    if (!confirm('Are you sure you want to create a new invite link?')) {
      return;
    }

    const inviteTokenResponse = await getClientSideRpcClient().admin.accountCreationInvitation.create();
    const createAccountUrl = new URL('/create-account', window.location.origin);
    createAccountUrl.searchParams.set('invite', inviteTokenResponse.inviteToken);

    alert(createAccountUrl.toString());
  }
</script>

<svelte:head>
  <title>Users - Admin - Apollo</title>
</svelte:head>

<div class="page-container">
  <header class="page-header">
    <div class="header-content">
      <h1>Users</h1>
      <p class="subtitle">Manage users and permissions</p>
    </div>
    <div class="header-actions">
      <button class="btn-primary" onclick={createInviteLink}>
        <TablerIcon icon="user-plus" />
        Create invite link
      </button>
    </div>
  </header>

  <div class="users-list">
    {#each users as user (user.id)}
      <a href="/admin/users/{user.id}" class="user-item">
        <div class="user-avatar">
          <img
            src="/api/_frontend/user/{user.id}/picture.png"
            alt={user.displayName}
            loading="lazy"
          />
        </div>

        <div class="user-info">
          <div class="user-name-row">
            <span class="display-name">{user.displayName}</span>
            <span class="user-id">{user.id}</span>
          </div>

          {#if user.blocked || user.isSuperUser}
            <div class="badges">
              {#if user.isSuperUser}
                <span class="badge badge-superuser">
                  <TablerIcon icon="shield-check-filled" />
                  Super User
                </span>
              {/if}
              {#if user.blocked}
                <span class="badge badge-blocked">
                  <TablerIcon icon="ban" />
                  Blocked
                </span>
              {/if}
            </div>
          {/if}
        </div>

        <div class="user-actions">
          <TablerIcon icon="chevron-right" />
        </div>
      </a>
    {/each}
  </div>
</div>

<style>
  .page-container {
    max-width: 1000px;
    margin:    0 auto;
    padding:   20px;
  }

  /* Header Styles */
  .page-header {
    display:         flex;
    justify-content: space-between;
    align-items:     center;
    margin-bottom:   30px;
  }

  .header-content h1 {
    font-size:   2rem;
    font-weight: 700;
    margin:      0 0 5px 0;
  }

  .subtitle {
    color:     var(--text-secondary);
    font-size: 1rem;
    margin:    0;
  }

  .btn-primary {
    display:          flex;
    align-items:      center;
    gap:              8px;
    background-color: var(--primary-color, #007bff);
    color:            white;
    border:           none;
    border-radius:    8px;
    padding:          10px 16px;
    font-weight:      600;
    cursor:           pointer;
    transition:       background-color 0.2s;
  }

  .btn-primary:hover {
    filter: brightness(110%);
  }

  /* List Styles */
  .users-list {
    display:        flex;
    flex-direction: column;
    gap:            12px;
  }

  .user-item {
    display:          flex;
    align-items:      center;
    gap:              20px;
    background-color: var(--secondary-bg, #1e1e1e);
    border:           1px solid var(--border-color, #333);
    border-radius:    12px;
    padding:          16px;
    text-decoration:  none;
    color:            inherit;
    transition:       transform 0.2s,
                      box-shadow 0.2s,
                      background-color 0.2s;
  }

  .user-item:hover {
    transform:        translateY(-2px);
    box-shadow:       0 4px 12px rgba(0, 0, 0, 0.1);
    background-color: var(--tertiary-bg, #252525);
    border-color:     var(--border-color-hover, #444);
  }

  /* Avatar */
  .user-avatar {
    width:            56px;
    height:           56px;
    border-radius:    50%;
    overflow:         hidden;
    background-color: var(--border-color, #333);
    flex-shrink:      0;
  }

  .user-avatar img {
    width:      100%;
    height:     100%;
    object-fit: cover;
  }

  /* Info */
  .user-info {
    flex:           1;
    display:        flex;
    flex-direction: column;
    gap:            6px;
  }

  .user-name-row {
    display:     flex;
    align-items: baseline;
    gap:         10px;
  }

  .display-name {
    font-size:   1.1rem;
    font-weight: 600;
    color:       var(--text-primary, #fff);
  }

  .user-id {
    font-family:   monospace;
    font-size:     0.85rem;
    color:         var(--text-secondary, #aaa);
    background:    rgba(255, 255, 255, 0.05);
    padding:       2px 6px;
    border-radius: 4px;
  }

  /* Badges */
  .badges {
    display: flex;
    gap:     8px;
  }

  .badge {
    display:        inline-flex;
    align-items:    center;
    gap:            4px;
    font-size:      0.75rem;
    font-weight:    600;
    padding:        4px 8px;
    border-radius:  4px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .badge-superuser {
    background-color: rgba(66, 153, 225, 0.15);
    color:            #63b3ed;
    border:           1px solid rgba(66, 153, 225, 0.3);
  }

  .badge-blocked {
    background-color: rgba(245, 101, 101, 0.15);
    color:            #fc8181;
    border:           1px solid rgba(245, 101, 101, 0.3);
  }

  /* Actions */
  .user-actions {
    color: var(--text-secondary, #aaa);
  }
</style>
