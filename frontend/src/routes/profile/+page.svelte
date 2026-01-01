<script lang="ts">
  import { getClientSideRpcClient } from '$lib/oRPCClientSide';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();

  const linkedAccounts = $derived(data.userProfile?.linkedAccounts ?? []);
  const sessions = $derived(data.userProfile?.session.all ?? []);
  const currentSessionId = $derived(data.userProfile?.session.current ?? null);

  function revokeSession(sessionId: string): void {
    // TODO: Show loading indicator in UI?

    getClientSideRpcClient()
      .auth
      .sessions
      .revokeSingleSession({ sessionId })
      .catch(err => {
        console.error('Error revoking session:', err);
        alert('Error revoking session... Reloading page.');
      })
      .finally(() => {
        window.location.reload();
      });
  }

  function revokeAllOtherSessions(): void {
    if (!confirm('Revoke all other sessions? This will sign out all devices except the current one.')) {
      return;
    }

    getClientSideRpcClient()
      .auth
      .sessions
      .revokeAllSessionsExceptCurrent()
      .catch(err => {
        console.error('Error revoking sessions:', err);
        alert('Error revoking sessions... Reloading page.');
      })
      .finally(() => {
        window.location.reload();
      });
  }

  function revokeAllSessions(): void {
    if (!confirm('Revoke all sessions? This will sign out all devices.')) {
      return;
    }

    // TODO: show loading indicator in UI?

    getClientSideRpcClient()
      .auth
      .sessions
      .revokeAllSessions()
      .catch(err => {
        console.error('Error revoking sessions:', err);
        alert('Error revoking sessions... Reloading page.');
      })
      .finally(() => {
        window.location.reload();
      });
  }
</script>

<main>
  <header>
    <h1>Account profile</h1>
    <p>Manage your account details, sessions, connected accounts and password.</p>
  </header>

  <section aria-labelledby="profile-heading">
    <h2 id="profile-heading">Profile</h2>

    <div>
      <div>
        <label for="name">Name or username (visible to others)</label>
        <input id="name" name="name" type="text" value={data.userProfile?.user.name ?? ''} readonly disabled />
      </div>


      <small>
        Account created:
        {data.userProfile?.user.createdAt ? new Date(data.userProfile.user.createdAt).toLocaleString() : 'unknown'}
      </small>
    </div>
  </section>

  <section aria-labelledby="accounts-heading">
    <h2 id="accounts-heading">Connected accounts</h2>

    <ul>
      {#each linkedAccounts as account}
        <li>
          <strong>{account.providerType}: {account.providerUserDisplayName}</strong>
          {#if account.providerUserId}
            <span>(id={account.providerUserId})</span>
          {/if}
          <div>
            <small>Connected: {new Date(account.createdAt).toLocaleString()}</small>
          </div>
        </li>
      {/each}

      {#each data.userProfile.availableAccountProviders as accountProvider}
        {#if linkedAccounts.find(linkedAcc => linkedAcc.providerType === accountProvider) == null}
          <li>
            <strong>{accountProvider}</strong>
            <div>
              <a href="/api/_auth/link/{accountProvider}">
                Link {accountProvider} account
              </a>
            </div>
          </li>
        {/if}
      {/each}
    </ul>
  </section>

  <section aria-labelledby="sessions-heading">
    <h2 id="sessions-heading">Active sessions</h2>
    <p>Sessions created from your browsers and devices. Revoke any session to force sign-out on that device.</p>

    <div class="actions-row">
      <button type="button" onclick={revokeAllOtherSessions}>Revoke all <em>other</em> sessions</button>
      <button type="button" onclick={revokeAllSessions}>Revoke all sessions</button>
    </div>

    <div class="table-wrap">
      <table class="sessions-table">
        <caption class="sr-only">List of active sessions</caption>
        <thead>
        <tr>
          <th scope="col">Device / user agent</th>
          <th scope="col">Created</th>
          <th scope="col">Expires</th>
          <th scope="col">Actions</th>
        </tr>
        </thead>
        <tbody>
        {#each sessions as session (session.id)}
          <tr class:current={session.id === currentSessionId}>
            <td class="device-cell">
              <div class="ua">
                {session.userAgent ?? 'Unknown'}
                {#if session.id === currentSessionId}
                  <small class="current-badge">Current session</small>
                {/if}
              </div>
            </td>
            <td>{session.createdAt ? new Date(session.createdAt).toLocaleString() : '-'}</td>
            <td>{session.expiresAt ? new Date(session.expiresAt).toLocaleString() : '-'}</td>
            <td>
              <button class="revoke" type="button" onclick={() => revokeSession(session.id)}>Revoke</button>
            </td>
          </tr>
        {/each}
        </tbody>
      </table>
    </div>
  </section>
</main>

<style>
  /* Container tweaks */
  .actions-row {
    display:   flex;
    gap:       0.5rem;
    margin:    0.5rem 0 1rem;
    flex-wrap: wrap;
  }

  .table-wrap {
    overflow-x: auto;
  }

  .sessions-table {
    width:           100%;
    border-collapse: collapse;
    font-size:       0.95rem;
    min-width:       640px; /* make it scroll on very small screens */
  }

  .sessions-table thead th {
    text-align:    left;
    padding:       0.6rem 0.75rem;
    font-weight:   600;
    background:    #f6f8fa;
    border-bottom: 1px solid #e6e8eb;
    color:         #0f1720;
  }

  .sessions-table td {
    padding:        0.6rem 0.75rem;
    border-bottom:  1px solid #eef2f6;
    vertical-align: middle;
    color:          #0f1720;
  }

  .sessions-table tbody tr:nth-child(even) {
    background: #fbfbfb;
  }

  .sessions-table tbody tr:hover {
    background: #f3f7fb;
  }

  /* Highlight the current session */
  .sessions-table tbody tr.current {
    background:  #e8f4ff; /* pale blue */
    font-weight: 600;
  }

  .device-cell .ua {
    overflow:      hidden;
    text-overflow: ellipsis;
    white-space:   nowrap;
  }

  .current-badge {
    display:        inline-block;
    margin-left:    0.5rem;
    padding:        0.12rem 0.4rem;
    font-size:      0.75rem;
    border-radius:  999px;
    background:     #0366d6;
    color:          white;
    vertical-align: middle;
  }

  .revoke {
    padding:       0.3rem 0.6rem;
    border-radius: 6px;
    border:        1px solid #d0d7de;
    background:    white;
    color:         #0f1720;
    cursor:        pointer;
    font-size:     0.9rem;
  }

  .revoke:hover {
    background: #f6fbff;
  }

  /* responsive: stack small screens */
  @media (max-width: 560px) {
    .sessions-table {
      min-width: 0;
      font-size: 0.9rem;
    }

    .sessions-table thead {
      display: none;
    }

    .sessions-table tbody tr {
      display:               grid;
      grid-template-columns: 1fr auto;
      gap:                   0.5rem;
      padding:               0.5rem 0;
      border-bottom:         1px solid #eef2f6;
    }

    .sessions-table td {
      display: block;
      padding: 0.25rem 0.5rem;
    }

    .sessions-table td:nth-child(2),
    .sessions-table td:nth-child(3),
    .sessions-table td:nth-child(4) {
      color:     #49515a;
      font-size: 0.875rem;
    }

    .revoke {
      justify-self: end;
    }

    .current-badge {
      margin-left: 0.25rem;
      font-size:   0.7rem;
      padding:     0.1rem 0.3rem;
    }
  }
</style>
