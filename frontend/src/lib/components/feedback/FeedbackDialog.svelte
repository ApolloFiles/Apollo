<script lang="ts">
  import TablerIcon from '$lib/components/TablerIcon.svelte';
  import { collectFeedbackContext, type FeedbackContext } from '$lib/feedback/feedbackContext';
  import { getClientSideRpcClient } from '$lib/oRPCClientSide';
  import { m } from '$lib/paraglide/messages.js';

  type FeedbackCategory = 'BUG' | 'FEEDBACK';

  let dialogElementRef: HTMLDialogElement;

  let category = $state<FeedbackCategory>('BUG');
  let message = $state('');
  let includeContext = $state(true);
  let collectedContext = $state<FeedbackContext | null>(null);
  let submitting = $state(false);
  let submitted = $state(false);
  let submitFailed = $state(false);

  let autoCloseTimeoutId: number | undefined;

  export function show(): void {
    hide();

    category = 'BUG';
    message = '';
    includeContext = true;
    collectedContext = null;
    submitting = false;
    submitted = false;
    submitFailed = false;

    collectFeedbackContext()
      .then((context) => {
        collectedContext = context;
      })
      .catch(console.error);

    dialogElementRef.showModal();
  }

  export function hide(): void {
    if (autoCloseTimeoutId != null) {
      window.clearTimeout(autoCloseTimeoutId);
      autoCloseTimeoutId = undefined;
    }

    dialogElementRef?.close();
  }

  async function onSubmit(event: SubmitEvent): Promise<void> {
    event.preventDefault();

    if (submitting || submitted || message.trim().length === 0) {
      return;
    }

    submitting = true;
    submitFailed = false;
    try {
      await getClientSideRpcClient().feedback.submit({
        category,
        message: message.trim(),
        context: includeContext ? collectedContext : null,
      });

      submitted = true;
      autoCloseTimeoutId = window.setTimeout(() => hide(), 2000);
    } catch (err) {
      console.error('Failed to submit feedback:', err);
      submitFailed = true;
    } finally {
      submitting = false;
    }
  }
</script>

<dialog bind:this={dialogElementRef} aria-label={m.component_feedback_dialog_title()}>
  {#if submitted}
    <div class="success-state">
      <TablerIcon icon="circle-check" />
      <p>{m.component_feedback_dialog_success()}</p>
    </div>
  {:else}
    <form onsubmit={onSubmit}>
      <h2>{m.component_feedback_dialog_title()}</h2>

      <div class="category-toggle" role="radiogroup" aria-label={m.component_feedback_dialog_category_label()}>
        <label class:active={category === 'BUG'}>
          <input type="radio" name="feedback-category" value="BUG" bind:group={category} />
          <TablerIcon icon="bug" />
          {m.component_feedback_dialog_category_bug()}
        </label>
        <label class:active={category === 'FEEDBACK'}>
          <input type="radio" name="feedback-category" value="FEEDBACK" bind:group={category} />
          <TablerIcon icon="message" />
          {m.component_feedback_dialog_category_feedback()}
        </label>
      </div>

      <textarea
        bind:value={message}
        rows="5"
        maxlength="4000"
        required
        placeholder={category === 'BUG' ? m.component_feedback_dialog_message_placeholder_bug() : m.component_feedback_dialog_message_placeholder_feedback()}
      ></textarea>

      <label class="include-context">
        <input type="checkbox" bind:checked={includeContext} />
        {m.component_feedback_dialog_include_context()}
      </label>

      {#if includeContext}
        <details class="context-preview">
          <summary>{m.component_feedback_dialog_show_context()}</summary>
          <pre>{collectedContext != null ? JSON.stringify(collectedContext, null, 2) : m.common_text_loading()}</pre>
        </details>
      {/if}

      {#if submitFailed}
        <p class="submit-error" role="alert">{m.component_feedback_dialog_error()}</p>
      {/if}

      <div class="actions">
        <button type="button" class="btn-secondary" onclick={hide}>
          {m.common_btn_label_cancel()}
        </button>
        <button type="submit" class="btn-primary" disabled={submitting || message.trim().length === 0}>
          {#if submitting}
            <TablerIcon icon="loader-2" spin={true} />
          {:else}
            <TablerIcon icon="send" />
          {/if}
          {m.component_feedback_dialog_btn_submit()}
        </button>
      </div>
    </form>
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

  form {
    display:        flex;
    flex-direction: column;
    gap:            14px;
    margin:         0;
  }

  h2 {
    font-size: 1.3rem;
    margin:    0;
  }

  .category-toggle {
    display:       flex;
    gap:           0;
    border:        1px solid var(--border-color, #333);
    border-radius: 8px;
    overflow:      hidden;
  }

  .category-toggle label {
    display:         flex;
    align-items:     center;
    justify-content: center;
    gap:             6px;
    flex:            1;
    padding:         8px 12px;
    cursor:          pointer;
    color:           var(--text-secondary, #aaa);
    transition:      background-color 0.2s, color 0.2s;
  }

  .category-toggle label.active {
    background-color: var(--primary-color, #007bff);
    color:            white;
  }

  .category-toggle input {
    position: absolute;
    opacity:  0;
    width:    0;
    height:   0;
  }

  textarea {
    background-color: var(--tertiary-bg, #252525);
    color:            var(--text-primary, #fff);
    border:           1px solid var(--border-color, #333);
    border-radius:    8px;
    padding:          10px 12px;
    resize:           vertical;
    min-height:       100px;
  }

  textarea:focus {
    border-color: var(--input-focus-border, #555);
    outline:      none;
  }

  .include-context {
    display:     flex;
    align-items: center;
    gap:         8px;
    cursor:      pointer;
    font-size:   0.9rem;
    color:       var(--text-secondary, #aaa);
  }

  .context-preview summary {
    cursor:    pointer;
    font-size: 0.85rem;
    color:     var(--text-secondary, #aaa);
  }

  .context-preview pre {
    background-color: var(--tertiary-bg, #252525);
    border:           1px solid var(--border-color, #333);
    border-radius:    8px;
    padding:          10px;
    margin:           8px 0 0 0;
    max-height:       200px;
    overflow:         auto;
    font-size:        0.75rem;
    white-space:      pre-wrap;
    word-break:       break-word;
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
    background-color: var(--primary-color, #007bff);
    color:            white;
  }

  .btn-primary:hover:not(:disabled),
  .btn-secondary:hover {
    filter: brightness(110%);
  }

  .btn-primary:disabled {
    opacity: 0.6;
    cursor:  not-allowed;
  }

  .success-state {
    display:        flex;
    flex-direction: column;
    align-items:    center;
    gap:            10px;
    padding:        20px 10px;
    text-align:     center;
    color:          var(--text-primary, #fff);
  }

  .success-state :global(svg) {
    width:  48px;
    height: 48px;
    color:  #68d391;
  }

  .success-state p {
    margin: 0;
  }
</style>
