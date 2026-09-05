<script lang="ts">
  import TablerIcon from '$lib/components/TablerIcon.svelte';
  import { m } from '$lib/paraglide/messages.js';

  type ConfirmDialogOptions = {
    title: string,
    message: string,
    confirmLabel: string,
    danger?: boolean,
    /** Resolves to an error message to keep the dialog open with, or to null when the action succeeded */
    onConfirm: () => Promise<string | null>,
  };

  let dialogElementRef: HTMLDialogElement;

  let options = $state.raw<ConfirmDialogOptions | null>(null);
  let busy = $state(false);
  let errorMessage = $state<string | null>(null);

  export function show(optionsToConfirm: ConfirmDialogOptions): void {
    options = optionsToConfirm;
    busy = false;
    errorMessage = null;

    dialogElementRef.showModal();
  }

  export function hide(): void {
    dialogElementRef?.close();
  }

  async function onConfirmClick(): Promise<void> {
    if (busy || options == null) {
      return;
    }

    busy = true;
    errorMessage = null;
    try {
      errorMessage = await options.onConfirm();
      if (errorMessage == null) {
        hide();
      }
    } finally {
      busy = false;
    }
  }
</script>

<dialog
  bind:this={dialogElementRef}
  aria-label={options?.title}
  oncancel={(event) => {
    if (busy) {
      event.preventDefault();
    }
  }}
>
  {#if options != null}
    <h2>{options.title}</h2>
    <p class="message">{options.message}</p>

    {#if errorMessage != null}
      <p class="error" role="alert">{errorMessage}</p>
    {/if}

    <div class="actions">
      <button type="button" class="btn-secondary" onclick={hide} disabled={busy}>
        {m.common_btn_label_cancel()}
      </button>
      <button
        type="button"
        class={options.danger ? 'btn-danger' : 'btn-primary'}
        onclick={onConfirmClick}
        disabled={busy}
      >
        {#if busy}
          <TablerIcon icon="loader-2" spin={true} />
        {/if}
        {options.confirmLabel}
      </button>
    </div>
  {/if}
</dialog>

<style>
  dialog {
    background-color: var(--secondary-bg, #1e1e1e);
    color:            var(--text-primary, #fff);
    border:           1px solid var(--border-color, #333);
    border-radius:    12px;
    padding:          24px;
    width:            min(520px, calc(100vw - 32px));
  }

  dialog::backdrop {
    background-color: black;
    opacity:          0.4;
  }

  h2 {
    font-size:     1.3rem;
    margin:        0;
    margin-bottom: 12px;
  }

  .message {
    color:     var(--text-secondary, #aaa);
    font-size: 0.95rem;
    margin:    0;
  }

  .error {
    color:     #fc8181;
    font-size: 0.9rem;
    margin:    14px 0 0 0;
  }

  .actions {
    display:         flex;
    justify-content: flex-end;
    gap:             10px;
    margin-top:      20px;
  }

  .actions button {
    display:       flex;
    align-items:   center;
    gap:           6px;
    border:        none;
    border-radius: 8px;
    padding:       10px 16px;
    font-weight:   600;
    cursor:        pointer;
    transition:    background-color 0.2s;
  }

  .btn-secondary {
    background-color: var(--tertiary-bg, #252525);
    color:            var(--text-primary, #fff);
    border:           1px solid var(--border-color, #333) !important;
  }

  .btn-primary {
    background-color: var(--accent-color, #e50914);
    color:            white;
  }

  .btn-danger {
    background-color: #d33;
    color:            white;
  }

  .actions button:hover:not(:disabled) {
    filter: brightness(110%);
  }

  .actions button:disabled {
    opacity: 0.6;
    cursor:  not-allowed;
  }
</style>
