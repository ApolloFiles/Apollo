<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
  import RelativeTime from '$lib/components/RelativeTime.svelte';
  import TablerIcon from '$lib/components/TablerIcon.svelte';
  import { getClientSideRpcClient } from '$lib/oRPCClientSide';
  import { m } from '$lib/paraglide/messages.js';
  import { isDefinedError, safe } from '@orpc/client';
  import CreateAccessTokenDialog from './components/CreateAccessTokenDialog.svelte';
  import RevealAccessTokenDialog from './components/RevealAccessTokenDialog.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();

  type AccessToken = (typeof data)['tokens'][number];

  let createDialogRef: CreateAccessTokenDialog;
  let revealDialogRef: RevealAccessTokenDialog;
  let confirmDialogRef: ConfirmDialog;

  const tokens = $derived.by(() => {
    const now = Date.now();
    const active: AccessToken[] = [];
    const dead: AccessToken[] = [];

    for (const token of data.tokens) {
      const isAlive = token.revokedAt == null && (token.expiresAt == null || token.expiresAt.getTime() > now);
      (isAlive ? active : dead).push(token);
    }
    return { active, dead };
  });

  function askToRotate(token: AccessToken): void {
    confirmDialogRef.show({
      title: m.page_settings_access_tokens_confirm_rotate_title({ name: token.name }),
      message: m.page_settings_access_tokens_confirm_rotate_message({ hint: token.tokenHint }),
      confirmLabel: m.page_settings_access_tokens_btn_rotate(),
      onConfirm: () => rotateToken(token),
    });
  }

  function askToRevoke(token: AccessToken): void {
    confirmDialogRef.show({
      title: m.page_settings_access_tokens_confirm_revoke_title({ name: token.name }),
      message: m.page_settings_access_tokens_confirm_revoke_message({ hint: token.tokenHint }),
      confirmLabel: m.page_settings_access_tokens_btn_revoke(),
      danger: true,
      onConfirm: () => revokeToken(token),
    });
  }

  async function rotateToken(token: AccessToken): Promise<string | null> {
    const result = await safe(getClientSideRpcClient().user.settings.accessTokens.rotate({ tokenId: token.id }));
    await invalidateAll();

    if (result.error != null) {
      if (isDefinedError(result.error) && result.error.code === 'ROTATION_FAILED') {
        return m.page_settings_access_tokens_error_rotate_failed();
      }

      console.error('Failed to rotate access token:', result.error);
      return m.page_settings_access_tokens_error_generic();
    }

    confirmDialogRef.hide();
    revealDialogRef.show(result.data.fullToken, 'rotated');
    return null;
  }

  async function revokeToken(token: AccessToken): Promise<string | null> {
    const result = await safe(getClientSideRpcClient().user.settings.accessTokens.revoke({ tokenId: token.id }));
    await invalidateAll();

    if (result.error != null) {
      if (isDefinedError(result.error) && result.error.code === 'REVOCATION_FAILED') {
        return m.page_settings_access_tokens_error_revoke_failed();
      }

      console.error('Failed to revoke access token:', result.error);
      return m.page_settings_access_tokens_error_generic();
    }

    return null;
  }

  async function onTokenCreated(fullToken: string): Promise<void> {
    revealDialogRef.show(fullToken, 'created');
    await invalidateAll();
  }
</script>

<svelte:head>
  <title>{m.page_settings_access_tokens_title()} | Apollo</title>
</svelte:head>

<div class="access-tokens-settings-page">
  <header class="settings-header">
    <h1>{m.page_settings_access_tokens_title()}</h1>
    <p class="subtitle">{m.page_settings_access_tokens_subtitle()}</p>
  </header>

  <section class="settings-section">
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h2 class="mb-0">{m.page_settings_access_tokens_active_heading()}</h2>
      <button class="btn btn-outline-primary btn-sm d-flex align-items-center gap-1" onclick={() => createDialogRef.show()}>
        <TablerIcon icon="plus" />
        {m.page_settings_access_tokens_btn_new()}
      </button>
    </div>

    <div class="settings-card">
      {#if tokens.active.length === 0}
        <p class="empty-state">{m.page_settings_access_tokens_empty_active()}</p>
      {:else}
        {#each tokens.active as token (token.id)}
          <div class="token-item">
            <div class="token-icon">
              <TablerIcon icon="key" />
            </div>
            <div class="token-info">
              <span class="token-name">{token.name}</span>
              <span class="token-hint">{token.tokenHint}</span>
              {#if token.description != null}
                <p class="token-description">{token.description}</p>
              {/if}
              <div class="token-meta">
                <span>{m.page_settings_access_tokens_meta_created()}: <RelativeTime date={token.createdAt} /></span>
                <span>
                  {m.page_settings_access_tokens_meta_expires()}:
                  {#if token.expiresAt != null}
                    <RelativeTime date={token.expiresAt} />
                  {:else}
                    {m.common_text_never()}
                  {/if}
                </span>
                <span>
                  {m.page_settings_access_tokens_meta_last_used()}:
                  {#if token.roughLastUsedAt != null}
                    <RelativeTime date={token.roughLastUsedAt} />
                  {:else}
                    {m.common_text_never()}
                  {/if}
                </span>
                <span>
                  {m.page_settings_access_tokens_meta_rotated()}:
                  {#if token.rotatedAt != null}
                    <RelativeTime date={token.rotatedAt} />
                  {:else}
                    {m.common_text_never()}
                  {/if}
                </span>
              </div>
            </div>
            <div class="token-actions">
              <button
                class="btn-icon-action"
                onclick={() => askToRotate(token)}
                title={m.page_settings_access_tokens_btn_rotate_hint()}
                aria-label={m.page_settings_access_tokens_btn_rotate()}
              >
                <TablerIcon icon="rotate" />
              </button>
              <button
                class="btn-icon-action danger"
                onclick={() => askToRevoke(token)}
                title={m.page_settings_access_tokens_btn_revoke_hint()}
                aria-label={m.page_settings_access_tokens_btn_revoke()}
              >
                <TablerIcon icon="trash" />
              </button>
            </div>
          </div>
        {/each}
      {/if}
    </div>
  </section>

  <section class="settings-section mt-5">
    <h2>{m.page_settings_access_tokens_history_heading()}</h2>

    <div class="settings-card">
      {#if tokens.dead.length === 0}
        <p class="empty-state">{m.page_settings_access_tokens_empty_history()}</p>
      {:else}
        {#each tokens.dead as token (token.id)}
          <div class="token-item dead">
            <div class="token-icon">
              <TablerIcon icon="key" />
            </div>
            <div class="token-info">
              <div class="d-flex align-items-center gap-2">
                <span class="token-name">{token.name}</span>
                {#if token.revokedAt != null}
                  <span class="badge bg-danger-subtle text-danger">{m.page_settings_access_tokens_badge_revoked()}</span>
                {:else}
                  <span class="badge bg-warning-subtle text-warning">{m.page_settings_access_tokens_badge_expired()}</span>
                {/if}
              </div>
              <span class="token-hint">{token.tokenHint}</span>
              <div class="token-meta">
                {#if token.revokedAt != null}
                  <span>{m.page_settings_access_tokens_meta_revoked_at()}: <RelativeTime date={token.revokedAt} /></span>
                {:else if token.expiresAt != null}
                  <span>{m.page_settings_access_tokens_meta_expired_at()}: <RelativeTime date={token.expiresAt} /></span>
                {/if}
                <span>{m.page_settings_access_tokens_meta_created()}: <RelativeTime date={token.createdAt} /></span>
              </div>
            </div>
          </div>
        {/each}
      {/if}
    </div>
  </section>
</div>

<CreateAccessTokenDialog bind:this={createDialogRef} onCreated={onTokenCreated} />
<RevealAccessTokenDialog bind:this={revealDialogRef} />
<ConfirmDialog bind:this={confirmDialogRef} />

<style>
  .access-tokens-settings-page {
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

  .empty-state {
    padding:    25px;
    margin:     0;
    color:      var(--text-secondary);
    text-align: center;
  }

  .token-item {
    display:       flex;
    align-items:   center;
    padding:       20px 25px;
    gap:           20px;
    border-bottom: 1px solid var(--border-color);
  }

  .token-item:last-child {
    border-bottom: none;
  }

  .token-item.dead {
    opacity: 0.6;
  }

  .token-icon {
    width:           42px;
    height:          42px;
    flex-shrink:     0;
    background:      rgba(255, 255, 255, 0.05);
    border-radius:   50%;
    display:         flex;
    align-items:     center;
    justify-content: center;
    color:           var(--text-secondary);
  }

  .token-info {
    flex:      1;
    min-width: 0;
  }

  .token-name {
    font-weight: 600;
    font-size:   1.05rem;
  }

  .token-hint {
    display:     block;
    font-family: monospace;
    font-size:   0.85rem;
    color:       var(--text-secondary);
    word-break:  break-all;
  }

  .token-description {
    margin:      6px 0 0 0;
    font-size:   0.9rem;
    color:       var(--text-muted);
    white-space: pre-wrap;
    word-break:  break-word;
  }

  .token-meta {
    display:        flex;
    flex-direction: column;
    gap:            8px;
    font-size:      0.85rem;
    color:          var(--text-secondary);
    margin-top:     8px;
  }

  .token-actions {
    display: flex;
    gap:     8px;
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

  .bg-danger-subtle {
    background-color: rgba(220, 53, 69, 0.2);
  }

  .bg-warning-subtle {
    background-color: rgba(255, 193, 7, 0.15);
  }
</style>
