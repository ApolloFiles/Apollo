<script lang="ts">
  import AuthProviderIcon from '$lib/components/auth/AuthProviderIcon.svelte';
  import TablerIcon from '$lib/components/TablerIcon.svelte';
  import { getClientSideRpcClient } from '$lib/oRPCClientSide';

  let { data } = $props();

  const user = $derived(data.user);
  const linkedAuthProviders = $derived(data.linkedAuthProviders);

  function formatDate(date: Date | null, removeTime = false): string {
    if (date == null) {
      return 'Never';
    }

    const options: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    };

    if (!removeTime) {
      options.hour = '2-digit';
      options.minute = '2-digit';
    }

    return date.toLocaleDateString(undefined, options);
  }

  function updateUserBlockStatus(block: boolean): void {
    const action = block ? 'block' : 'unblock';
    if (!confirm(`Are you sure you want to ${action} this user?`)) {
      return;
    }

    getClientSideRpcClient()
      .admin
      .users
      .updateBlock({
        id: user.id,
        block: block,
      })
      .then(() => window.location.reload())
      .catch((error) => {
        alert(`ERROR: ${error.message}`);
      });
  }

  function unlinkAuthProvider(providerId: string): void {
    if (!confirm('Are you sure you want to unlink this authentication provider from the user?')) {
      return;
    }

    getClientSideRpcClient()
      .admin
      .users
      .unlinkAuthProvider({
        id: user.id,
        providerId: providerId,
      })
      .then(() => window.location.reload())
      .catch((error) => {
        alert(`ERROR: ${error.message}`);
      });
  }
</script>

<svelte:head>
  <title>{user.displayName} - User Details - Apollo</title>
</svelte:head>

<div class="page-container">
  <!-- Header -->
  <header class="page-header">
    <div class="header-content">
      <div class="d-flex align-items-center gap-3">
        <a href="/admin/users" class="back-link" aria-label="Back to users">
          <TablerIcon icon="arrow-left" />
        </a>
        <div>
          <h1>{user.displayName}</h1>
          <p class="subtitle">User Details</p>
        </div>
      </div>
    </div>
    <div class="header-actions">
      <button class="btn btn-outline-danger" onclick={() => updateUserBlockStatus(!user.blocked)}>
        <TablerIcon icon="ban" />
        {user.blocked ? "Unblock User" : "Block User"}
      </button>
    </div>
  </header>

  <div class="grid-layout">
    <!-- User Info Card -->
    <section class="card">
      <div class="card-header">
        <h2>User Information</h2>
      </div>
      <div class="card-body">
        <div class="user-profile-header">
          <div class="avatar-large">
            <img
              src="/api/_frontend/user/{user.id}/picture.png"
              alt={user.displayName}
            />
          </div>
          <div class="user-badges">
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
        </div>

        <div class="info-grid">
          <div class="info-item">
            <span class="label">Display Name</span>
            <div class="value">{user.displayName}</div>
          </div>
          <div class="info-item">
            <span class="label">User ID</span>
            <div class="value monospace">{user.id}</div>
          </div>
          <div class="info-item">
            <span class="label">Created At</span>
            <div class="value">{formatDate(user.createdAt)}</div>
          </div>
          <div class="info-item">
            <span class="label">Last Login</span>
            <div class="value">{formatDate(user.lastLoginDate, true)}</div>
          </div>
          <div class="info-item">
            <span class="label">Last Activity</span>
            <div class="value">{formatDate(user.lastActivityDate, true)}</div>
          </div>
        </div>
      </div>
    </section>

    <!-- Connected Accounts Card -->
    <section class="card">
      <div class="card-header">
        <h2>Connected Accounts</h2>
      </div>
      <div class="card-body p-0">
        {#if linkedAuthProviders.length > 0}
          <div class="provider-list">
            {#each linkedAuthProviders as provider}
              <div class="provider-item">
                <AuthProviderIcon identifier={provider.identifier} />

                <div class="provider-info">
                  <div class="provider-name-row">
                    <span class="provider-name">{provider.displayName}</span>
                  </div>
                  <div class="provider-details">
                    <span class="detail-text">
                      Name:
                      {#if provider.providerUserDisplayName}
                        <strong>{provider.providerUserDisplayName}</strong>
                      {:else}
                        <em>None</em>
                      {/if}
                    </span>
                    <span class="detail-text">
                      Identifier: <strong>{provider.providerUserId}</strong>
                    </span>
                    <span class="detail-text">
                      Linked: {formatDate(provider.linkedAt)}
                    </span>
                  </div>
                </div>

                <div class="provider-actions">
                  <button
                    class="btn btn-sm btn-outline-danger"
                    onclick={() => unlinkAuthProvider(provider.identifier)}
                    title="Force Unlink"
                  >
                    <TablerIcon icon="link-off" />
                    Unlink
                  </button>
                </div>
              </div>
            {/each}
          </div>
        {:else}
          <div class="empty-state">
            <TablerIcon icon="link-off" />
            <p>No connected accounts found</p>
          </div>
        {/if}
      </div>
    </section>
  </div>
</div>

<style>
  .page-container {
    max-width: 1000px;
    margin:    0 auto;
    padding:   20px;
  }

  /* Header */
  .page-header {
    display:         flex;
    justify-content: space-between;
    align-items:     center;
    margin-bottom:   30px;
  }

  .back-link {
    color:           var(--text-secondary);
    width:           36px;
    height:          36px;
    display:         flex;
    align-items:     center;
    justify-content: center;
    border-radius:   8px;
    transition:      all 0.2s;
    background:      var(--secondary-bg);
    border:          1px solid var(--border-color);
  }

  .back-link:hover {
    color:      var(--text-primary);
    background: var(--tertiary-bg);
  }

  .header-content h1 {
    font-size:   2rem;
    font-weight: 700;
    margin:      0 0 5px 0;
    line-height: 1.2;
  }

  .subtitle {
    color:     var(--text-secondary);
    font-size: 1rem;
    margin:    0;
  }

  /* Buttons */
  .btn {
    display:       inline-flex;
    align-items:   center;
    gap:           8px;
    padding:       8px 16px;
    border-radius: 8px;
    font-weight:   600;
    cursor:        pointer;
    transition:    all 0.2s;
    border:        1px solid transparent;
    font-size:     0.9rem;
  }

  .btn-sm {
    padding:   6px 12px;
    font-size: 0.85rem;
  }

  .btn-outline-danger {
    color:        #ff6b6b;
    border-color: #ff6b6b;
    background:   transparent;
  }

  .btn-outline-danger:hover {
    background: rgba(255, 107, 107, 0.1);
  }

  /* Layout */
  .grid-layout {
    display:               grid;
    grid-template-columns: 1fr;
    gap:                   24px;
  }

  @media (min-width: 768px) {
    .grid-layout {
      grid-template-columns: 350px 1fr;
      align-items:           start;
    }
  }

  /* Cards */
  .card {
    background-color: var(--secondary-bg);
    border:           1px solid var(--border-color);
    border-radius:    12px;
    overflow:         hidden;
    box-shadow:       0 4px 20px var(--card-shadow, rgba(0, 0, 0, 0.1));
  }

  .card-header {
    padding:       20px 24px;
    border-bottom: 1px solid var(--border-color);
  }

  .card-header h2 {
    font-size:   1.1rem;
    font-weight: 600;
    margin:      0;
    color:       var(--text-primary);
  }

  .card-body {
    padding: 24px;
  }

  .card-body.p-0 {
    padding: 0;
  }

  /* User Profile Header */
  .user-profile-header {
    display:        flex;
    flex-direction: column;
    align-items:    center;
    margin-bottom:  24px;
    text-align:     center;
  }

  .avatar-large {
    width:            120px;
    height:           120px;
    border-radius:    50%;
    overflow:         hidden;
    background-color: var(--border-color);
    margin-bottom:    16px;
    border:           4px solid var(--secondary-bg);
    box-shadow:       0 0 0 1px var(--border-color);
  }

  .avatar-large img {
    width:      100%;
    height:     100%;
    object-fit: cover;
  }

  .user-badges {
    display:         flex;
    gap:             8px;
    flex-wrap:       wrap;
    justify-content: center;
  }

  /* Info Grid */
  .info-grid {
    display:        flex;
    flex-direction: column;
    gap:            16px;
  }

  .info-item {
    display:         flex;
    justify-content: space-between;
    align-items:     center;
    padding-bottom:  12px;
    border-bottom:   1px solid var(--border-color);
  }

  .info-item:last-child {
    border-bottom:  none;
    padding-bottom: 0;
  }

  .label {
    font-size:   0.9rem;
    color:       var(--text-secondary);
    font-weight: 500;
  }

  .info-item .value {
    font-size:   0.95rem;
    color:       var(--text-primary);
    font-weight: 500;
  }

  .value.monospace {
    font-family:   monospace;
    background:    rgba(255, 255, 255, 0.05);
    padding:       2px 6px;
    border-radius: 4px;
    font-size:     0.85rem;
  }

  /* Provider List */
  .provider-item {
    display:       flex;
    align-items:   center;
    padding:       16px 24px;
    gap:           16px;
    border-bottom: 1px solid var(--border-color);
  }

  .provider-item:last-child {
    border-bottom: none;
  }

  .provider-info {
    flex:      1;
    min-width: 0;
  }

  .provider-name-row {
    display:       flex;
    align-items:   center;
    gap:           8px;
    margin-bottom: 4px;
  }

  .provider-name {
    font-weight: 600;
    font-size:   1rem;
  }

  .provider-details {
    display:        flex;
    flex-direction: column;
    gap:            2px;
  }

  .detail-text {
    font-size:     0.85rem;
    color:         var(--text-secondary);
    white-space:   nowrap;
    overflow:      hidden;
    text-overflow: ellipsis;
  }

  .empty-state {
    padding:        40px;
    text-align:     center;
    color:          var(--text-secondary);
    display:        flex;
    flex-direction: column;
    align-items:    center;
    gap:            12px;
  }

  /* Badges */
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
</style>
