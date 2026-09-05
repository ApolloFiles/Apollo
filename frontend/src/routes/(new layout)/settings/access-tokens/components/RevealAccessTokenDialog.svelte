<script lang="ts">
  import TablerIcon from '$lib/components/TablerIcon.svelte';
  import { m } from '$lib/paraglide/messages.js';

  type RevealReason = 'created' | 'rotated';

  let dialogElementRef: HTMLDialogElement;
  let tokenInputRef: HTMLInputElement | undefined = $state(undefined);

  let fullToken = $state('');
  let reason = $state<RevealReason>('created');
  let visualizeCopyToClipboard = $state(false);

  let copyToClipboardTimeout: number | undefined;

  export function show(tokenToReveal: string, revealReason: RevealReason): void {
    clearCopyToClipboardTimeout();

    fullToken = tokenToReveal;
    reason = revealReason;
    visualizeCopyToClipboard = false;

    dialogElementRef.showModal();
  }

  export function hide(): void {
    dialogElementRef?.close();
  }

  function clearCopyToClipboardTimeout(): void {
    if (copyToClipboardTimeout != null) {
      window.clearTimeout(copyToClipboardTimeout);
      copyToClipboardTimeout = undefined;
    }
  }

  async function copyToken(): Promise<void> {
    try {
      await navigator.clipboard.writeText(fullToken);
    } catch (err) {
      // No clipboard access on insecure origins – select the token so it can be copied manually
      console.error('Failed to copy the access token to the clipboard:', err);
      tokenInputRef?.select();
      return;
    }

    clearCopyToClipboardTimeout();
    copyToClipboardTimeout = window.setTimeout(() => {
      visualizeCopyToClipboard = false;
      copyToClipboardTimeout = undefined;
    }, 2000);
    visualizeCopyToClipboard = true;
  }
</script>

<dialog
  bind:this={dialogElementRef}
  aria-label={reason === 'created' ? m.page_settings_access_tokens_reveal_title_created() : m.page_settings_access_tokens_reveal_title_rotated()}
  onclose={() => {
    clearCopyToClipboardTimeout();
    fullToken = '';
  }}
>
  <header>
    <h2>
      <TablerIcon icon="alert-triangle" />
      {reason === 'created' ? m.page_settings_access_tokens_reveal_title_created() : m.page_settings_access_tokens_reveal_title_rotated()}
    </h2>
    <button type="button" class="btn-close-icon" onclick={hide} aria-label={m.page_settings_access_tokens_btn_close()}>
      <TablerIcon icon="x" />
    </button>
  </header>

  <p class="warning">{m.page_settings_access_tokens_reveal_warning()}</p>

  <div class="token-box">
    <input bind:this={tokenInputRef} type="text" value={fullToken} readonly onfocus={(event) => event.currentTarget.select()} />
    <button type="button" class="btn-copy" onclick={copyToken}>
      {#if visualizeCopyToClipboard}
        <TablerIcon icon="clipboard-check" />
        {m.page_settings_access_tokens_btn_copied()}
      {:else}
        <TablerIcon icon="clipboard" />
        {m.page_settings_access_tokens_btn_copy()}
      {/if}
    </button>
  </div>

  <div class="actions">
    <button type="button" class="btn-primary" onclick={hide}>
      {m.page_settings_access_tokens_btn_close()}
    </button>
  </div>
</dialog>

<style>
  dialog {
    background-color: var(--secondary-bg, #1e1e1e);
    color:            var(--text-primary, #fff);
    border:           1px solid var(--border-color, #333);
    border-radius:    12px;
    padding:          24px;
    width:            min(560px, calc(100vw - 32px));
  }

  dialog::backdrop {
    background-color: black;
    opacity:          0.4;
  }

  header {
    display:         flex;
    align-items:     center;
    justify-content: space-between;
    gap:             12px;
  }

  h2 {
    display:     flex;
    align-items: center;
    gap:         8px;
    font-size:   1.3rem;
    margin:      0;
  }

  h2 :global(svg) {
    color: #f0ad4e;
  }

  .btn-close-icon {
    background:    none;
    border:        none;
    color:         var(--text-secondary, #aaa);
    cursor:        pointer;
    padding:       4px;
    line-height:   0;
    border-radius: 6px;
  }

  .btn-close-icon:hover {
    color:            var(--text-primary, #fff);
    background-color: var(--hover-bg, rgba(255, 255, 255, 0.1));
  }

  .warning {
    color:     var(--text-secondary, #aaa);
    font-size: 0.95rem;
    margin:    12px 0 0 0;
  }

  .token-box {
    display:     flex;
    align-items: stretch;
    gap:         8px;
    margin-top:  16px;
  }

  .token-box input {
    flex:             1;
    min-width:        0;
    background-color: var(--tertiary-bg, #252525);
    color:            var(--text-primary, #fff);
    border:           1px solid var(--border-color, #333);
    border-radius:    8px;
    padding:          10px 12px;
    font-family:      monospace;
    font-size:        0.9rem;
  }

  .btn-copy {
    display:          flex;
    align-items:      center;
    gap:              6px;
    white-space:      nowrap;
    background-color: var(--tertiary-bg, #252525);
    color:            var(--text-primary, #fff);
    border:           1px solid var(--border-color, #333);
    border-radius:    8px;
    padding:          10px 16px;
    font-weight:      600;
    cursor:           pointer;
  }

  .btn-copy:hover {
    filter: brightness(120%);
  }

  .actions {
    display:         flex;
    justify-content: flex-end;
    margin-top:      20px;
  }

  .btn-primary {
    background-color: var(--accent-color, #e50914);
    color:            white;
    border:           none;
    border-radius:    8px;
    padding:          10px 16px;
    font-weight:      600;
    cursor:           pointer;
  }

  .btn-primary:hover {
    filter: brightness(110%);
  }
</style>
