<script lang="ts">
  import TablerIcon from '$lib/components/TablerIcon.svelte';
  import { getClientSideRpcClient } from '$lib/oRPCClientSide';
  import { m } from '$lib/paraglide/messages.js';

  const SECONDS_PER_DAY = 24 * 60 * 60;
  const LIFETIME_OPTIONS = [
    { id: '30d', label: m.page_settings_access_tokens_lifetime_30_days, seconds: 30 * SECONDS_PER_DAY },
    { id: '60d', label: m.page_settings_access_tokens_lifetime_60_days, seconds: 60 * SECONDS_PER_DAY },
    { id: '90d', label: m.page_settings_access_tokens_lifetime_90_days, seconds: 90 * SECONDS_PER_DAY },
    { id: '365d', label: m.page_settings_access_tokens_lifetime_365_days, seconds: 365 * SECONDS_PER_DAY },
    { id: 'never', label: m.page_settings_access_tokens_lifetime_never, seconds: null },
  ] satisfies { id: string, label: () => string, seconds: number | null }[];
  const DEFAULT_LIFETIME_ID = '90d';

  let { onCreated }: { onCreated: (fullToken: string) => void } = $props();

  let dialogElementRef: HTMLDialogElement;

  let name = $state('');
  let description = $state('');
  let lifetimeId = $state<string>(DEFAULT_LIFETIME_ID);
  let submitting = $state(false);
  let submitFailed = $state(false);

  const selectedLifetime = $derived(LIFETIME_OPTIONS.find((option) => option.id === lifetimeId));
  const canSubmit = $derived(!submitting && name.trim().length > 0);

  export function show(): void {
    name = '';
    description = '';
    lifetimeId = DEFAULT_LIFETIME_ID;
    submitting = false;
    submitFailed = false;

    dialogElementRef.showModal();
  }

  export function hide(): void {
    dialogElementRef?.close();
  }

  async function onSubmit(event: SubmitEvent): Promise<void> {
    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    submitting = true;
    submitFailed = false;
    try {
      const createdToken = await getClientSideRpcClient().user.settings.accessTokens.create({
        name,
        description,
        lifetimeSeconds: selectedLifetime?.seconds ?? null,
      });

      hide();
      onCreated(createdToken.fullToken);
    } catch (err) {
      console.error('Failed to create access token:', err);
      submitFailed = true;
    } finally {
      submitting = false;
    }
  }
</script>

<dialog
  bind:this={dialogElementRef}
  aria-label={m.page_settings_access_tokens_create_dialog_title()}
  oncancel={(event) => {
    if (submitting) {
      event.preventDefault();
    }
  }}
>
  <form onsubmit={onSubmit}>
    <h2>{m.page_settings_access_tokens_create_dialog_title()}</h2>

    <label class="field">
      <span class="field-label">{m.page_settings_access_tokens_field_name_label()}</span>
      <input
        type="text"
        bind:value={name}
        maxlength="50"
        required
        disabled={submitting}
        placeholder={m.page_settings_access_tokens_field_name_placeholder()}
      />
    </label>

    <label class="field">
      <span class="field-label">{m.page_settings_access_tokens_field_description_label()}</span>
      <textarea bind:value={description} rows="3" maxlength="4000" disabled={submitting}></textarea>
    </label>

    <div class="field" role="radiogroup" aria-label={m.page_settings_access_tokens_field_lifetime_label()}>
      <span class="field-label">{m.page_settings_access_tokens_field_lifetime_label()}</span>
      <div class="lifetime-options">
        {#each LIFETIME_OPTIONS as option (option.id)}
          <label class={option.id === lifetimeId ? 'lifetime-option active' : 'lifetime-option'}>
            <input type="radio" name="token-lifetime" value={option.id} bind:group={lifetimeId} disabled={submitting} />
            {option.label()}
          </label>
        {/each}
      </div>
    </div>

    {#if submitFailed}
      <p class="submit-error" role="alert">{m.page_settings_access_tokens_error_generic()}</p>
    {/if}

    <div class="actions">
      <button type="button" class="btn-secondary" onclick={hide} disabled={submitting}>
        {m.common_btn_label_cancel()}
      </button>
      <button type="submit" class="btn-primary" disabled={!canSubmit}>
        {#if submitting}
          <TablerIcon icon="loader-2" spin={true} />
        {:else}
          <TablerIcon icon="plus" />
        {/if}
        {m.page_settings_access_tokens_btn_create()}
      </button>
    </div>
  </form>
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

  form {
    display:        flex;
    flex-direction: column;
    gap:            18px;
    margin:         0;
  }

  h2 {
    font-size: 1.3rem;
    margin:    0;
  }

  .field {
    display:        flex;
    flex-direction: column;
    gap:            6px;
  }

  .field-label {
    font-size:   0.9rem;
    font-weight: 600;
    color:       var(--text-secondary, #aaa);
  }

  input[type='text'],
  textarea {
    background-color: var(--tertiary-bg, #252525);
    color:            var(--text-primary, #fff);
    border:           1px solid var(--border-color, #333);
    border-radius:    8px;
    padding:          10px 12px;
    font:             inherit;
  }

  textarea {
    resize:     vertical;
    min-height: 70px;
  }

  input[type='text']:focus,
  textarea:focus {
    border-color: var(--input-focus-border, #555);
    outline:      none;
  }

  .lifetime-options {
    display:   flex;
    flex-wrap: wrap;
    gap:       8px;
  }

  .lifetime-option {
    border:        1px solid var(--border-color, #333);
    border-radius: 999px;
    padding:       6px 14px;
    cursor:        pointer;
    font-size:     0.9rem;
    color:         var(--text-secondary, #aaa);
    transition:    background-color 0.2s, color 0.2s, border-color 0.2s;
  }

  .lifetime-option.active {
    background-color: var(--accent-color, #e50914);
    border-color:     var(--accent-color, #e50914);
    color:            white;
  }

  .lifetime-option input {
    position: absolute;
    opacity:  0;
    width:    0;
    height:   0;
  }

  .submit-error {
    color:     #fc8181;
    font-size: 0.9rem;
    margin:    0;
  }

  .actions {
    display:         flex;
    justify-content: flex-end;
    gap:             10px;
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

  .actions button:hover:not(:disabled) {
    filter: brightness(110%);
  }

  .actions button:disabled {
    opacity: 0.6;
    cursor:  not-allowed;
  }
</style>
