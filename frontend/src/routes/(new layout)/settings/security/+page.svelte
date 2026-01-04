<script lang="ts">
  import AuthProviderIcon from '$lib/components/auth/AuthProviderIcon.svelte';
  import { getClientSideRpcClient } from '$lib/oRPCClientSide';
  import IconDeviceDesktop from 'virtual:icons/tabler/device-desktop';
  import IconLink from 'virtual:icons/tabler/link';
  import IconUnlink from 'virtual:icons/tabler/link-off';
  import IconTrash from 'virtual:icons/tabler/trash';
  import type { PageProps } from './$types';

  // TODO: This page needs CSRF protection
  // TODO: Hide provider user ids by default (show on click)

  let { data }: PageProps = $props();

  const authProviders = $derived.by(() => {
    const authProviders: ({
                            identifier: string,
                            displayName: string,
                          } & (
                            { linked: false }
                            | { linked: true, providerUserNameToRender: string }
                            ))[] = [];

    for (const linkedAuthProvider of data.linkedAuthProviders) {
      let providerUserNameToRender = '';
      if (linkedAuthProvider.providerUserId === linkedAuthProvider.providerUserDisplayName) {
        providerUserNameToRender = linkedAuthProvider.providerUserId;
      } else if (linkedAuthProvider.providerUserDisplayName != null) {
        providerUserNameToRender = `${linkedAuthProvider.providerUserDisplayName} (${linkedAuthProvider.providerUserId})`;
      } else {
        providerUserNameToRender = linkedAuthProvider.providerUserId;
      }

      authProviders.push({
        identifier: linkedAuthProvider.identifier,
        displayName: linkedAuthProvider.displayName,
        linked: true,
        providerUserNameToRender,
      });
    }

    for (const provider of data.allAuthProviderTypes) {
      if (!authProviders.find(p => p.identifier === provider.identifier)) {
        authProviders.push({
          ...provider,
          linked: false,
        });
      }
    }

    return authProviders;
  });

  async function revokeSession(sessionId: bigint): Promise<void> {
    try {
      await getClientSideRpcClient().user.settings.security.revokeSingleSession({ sessionId });
    } finally {
      window.location.reload();
    }
  }

  async function revokeAllOther(): Promise<void> {
    try {
      await getClientSideRpcClient().user.settings.security.revokeAllSessionsExceptCurrent();
    } finally {
      window.location.reload();
    }
  }
</script>

<svelte:head>
  <title>Security Settings - Apollo</title>
</svelte:head>

<div class="security-settings-page">
  <header class="settings-header">
    <h1>Security Settings</h1>
    <p class="subtitle">Manage your account security and connections</p>
  </header>

  <!-- OAuth Section -->
  <section class="settings-section">
    <h2>Connected Accounts</h2>
    <div class="settings-card">
      <div class="provider-list">
        {#each authProviders as authProvider (authProvider.identifier)}
          <div class="provider-item">
            <AuthProviderIcon identifier={authProvider.identifier} />

            <div class="provider-info">
              <div class="d-flex align-items-center gap-2">
                <span class="provider-name">{authProvider.displayName}</span>
                {#if authProvider.linked}
                  <span class="badge bg-success-subtle text-success">Connected</span>
                {/if}
              </div>
              {#if authProvider.linked}
                <div class="provider-details">
                  <span class="text-secondary small">Linked as <strong>{authProvider.providerUserNameToRender}</strong></span>
                </div>
              {:else}
                <span class="text-secondary small">Not connected</span>
              {/if}
            </div>
            <div class="provider-action">
              <form
                action="/api/_auth/provider/{authProvider.linked ? 'unlink' : 'link'}"
                method="POST"
                enctype="application/x-www-form-urlencoded"
              >
                <input type="hidden" name="providerType" value={authProvider.identifier} />
                <button
                  type="submit"
                  class="btn btn-outline-danger btn-sm d-flex align-items-center gap-1"
                  class:btn-outline-danger={authProvider.linked}
                  class:btn-outline-primary={!authProvider.linked}
                >
                  {#if authProvider.linked}
                    <IconUnlink class="icon" />
                    Disconnect
                  {:else}
                    <IconLink class="icon" />
                    Connect
                  {/if}
                </button>
              </form>
            </div>
          </div>
        {/each}
      </div>
    </div>
  </section>

  <!-- Sessions Section -->
  <section class="settings-section mt-5">
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h2 class="mb-0">Active Sessions</h2>
      <button class="btn btn-outline-danger btn-sm" onclick={revokeAllOther}>
        Log out on all other devices
      </button>
    </div>

    <div class="settings-card">
      <div class="session-list">
        {#each data.sessions.all as session}
          <div class="session-item" class:current={session.id === data.sessions.currentId}>
            <div class="session-icon">
              <IconDeviceDesktop class="icon" />
            </div>
            <div class="session-info">
              <div class="d-flex align-items-center gap-2">
                <span class="device-name">{session.userAgent}</span>
                {#if session.id === data.sessions.currentId}
                  <span
                    class="badge bg-primary-subtle text-primary border border-primary-subtle"
                  >Current Session</span>
                {/if}
              </div>
              <div class="session-meta">
                <span>createdAt={session.createdAt.toLocaleString()}</span>
                <span>expiresAt={session.expiresAt.toLocaleString()}</span>
                <span>roughLastActivity={session.roughLastActivity.toLocaleString()}</span>
              </div>
            </div>
            <div class="session-action">
              <button
                class="btn-icon-action danger"
                onclick={() => revokeSession(session.id)}
                aria-label="Revoke session"
              >
                <IconTrash class="icon" />
              </button>
            </div>
          </div>
        {/each}
      </div>
    </div>
  </section>
</div>

<style>
  .security-settings-page {
    max-width:      800px;
    margin:         0 auto;
    padding-bottom: 40px;
  }

  .settings-header {
    margin-bottom: 30px;
  }

  .settings-header h1 {
    font-size:     2rem;
    font-weight:   700;
    margin-bottom: 8px;
  }

  .subtitle {
    color:     var(--text-secondary);
    font-size: 1.1rem;
  }

  .settings-section h2 {
    font-size:     1.25rem;
    font-weight:   600;
    margin-bottom: 15px;
    color:         var(--text-primary);
  }

  .settings-card {
    background-color: var(--secondary-bg);
    border:           1px solid var(--border-color);
    border-radius:    12px;
    overflow:         hidden;
    box-shadow:       0 4px 20px var(--card-shadow);
  }

  .provider-item,
  .session-item {
    display:       flex;
    align-items:   center;
    padding:       20px 25px;
    gap:           20px;
    border-bottom: 1px solid var(--border-color);
  }

  .provider-item:last-child,
  .session-item:last-child {
    border-bottom: none;
  }

  .provider-info,
  .session-info {
    flex: 1;
  }

  .provider-name,
  .device-name {
    font-weight: 600;
    font-size:   1.05rem;
  }

  .session-icon {
    width:           42px;
    height:          42px;
    background:      rgba(255, 255, 255, 0.05);
    border-radius:   50%;
    display:         flex;
    align-items:     center;
    justify-content: center;
    color:           var(--text-secondary);
  }

  .session-item.current .session-icon {
    color:      #4285f4;
    background: rgba(66, 133, 244, 0.1);
  }

  .session-meta {
    display:        flex;
    flex-direction: column;
    gap:            8px;
    font-size:      0.85rem;
    color:          var(--text-secondary);
    margin-top:     2px;
  }

  .btn-icon-action {
    background:      none;
    border:          1px solid var(--border-color);
    border-radius:   8px;
    width:           38px;
    height:          38px;
    display:         flex;
    align-items:     center;
    justify-content: center;
    cursor:          pointer;
    color:           var(--text-secondary);
    transition:      all 0.2s ease;
  }

  .btn-icon-action:hover {
    background-color: var(--hover-bg);
    color:            var(--text-primary);
    border-color:     var(--text-muted);
  }

  .btn-icon-action.danger:hover {
    color:        #ff4d4d;
    background:   rgba(255, 77, 77, 0.1);
    border-color: #ff4d4d;
  }

  .badge {
    font-size:      0.7rem;
    padding:        4px 8px;
    font-weight:    600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    border-radius:  4px;
  }

  .bg-success-subtle {
    background-color: rgba(25, 135, 84, 0.2);
  }

  .bg-primary-subtle {
    background-color: rgba(66, 133, 244, 0.1);
  }
</style>
