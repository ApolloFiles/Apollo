<script lang="ts">
  import { beforeNavigate, goto, invalidateAll } from '$app/navigation';
  import TablerIcon from '$lib/components/TablerIcon.svelte';
  import { getClientSideRpcClient } from '$lib/oRPCClientSide';
  import { m } from '$lib/paraglide/messages.js';
  import { getLocale } from '$lib/paraglide/runtime';

  let { data } = $props();

  const report = $derived(data.report);

  const categoryLabels = {
    BUG: m.page_admin_feedback_category_bug,
    FEEDBACK: m.page_admin_feedback_category_feedback,
  } as const;

  const statusLabels = {
    OPEN: m.page_admin_feedback_status_open,
    IN_PROGRESS: m.page_admin_feedback_status_in_progress,
    RESOLVED: m.page_admin_feedback_status_resolved,
    WONT_FIX: m.page_admin_feedback_status_wont_fix,
  } as const;

  // Writable $derived: user edits reassign the value, navigating to another report resets it
  let editedStatus = $derived(report.status);
  let editedAdminNote = $derived(report.adminNote ?? '');
  let saving = $state(false);
  let recentlySaved = $state(false);
  let bypassUnsavedChangesWarning = false;

  const hasUnsavedChanges = $derived(
    editedStatus !== report.status ||
    editedAdminNote.trim() !== (report.adminNote ?? ''),
  );

  function beforeUnloadEventListener(event: BeforeUnloadEvent): void {
    event.preventDefault();
    //noinspection JSDeprecatedSymbols
    event.returnValue = true;
  }

  $effect(() => {
    if (hasUnsavedChanges) {
      window.addEventListener('beforeunload', beforeUnloadEventListener);

      return () => {
        window.removeEventListener('beforeunload', beforeUnloadEventListener);
      };
    }
  });

  beforeNavigate((navigation) => {
    if (navigation.willUnload) {
      return; // Handled by the 'beforeunload' event listener above
    }
    if (!hasUnsavedChanges || bypassUnsavedChangesWarning) {
      return;
    }

    const proceed = window.confirm('There are unsaved changes that will be lost if you leave this page. Do you want to proceed?');
    if (proceed !== true) {
      navigation.cancel();
    }
  });

  function formatDate(date: Date): string {
    return date.toLocaleDateString(getLocale(), {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  async function saveChanges(): Promise<void> {
    if (saving) {
      return;
    }

    saving = true;
    recentlySaved = false;
    try {
      await getClientSideRpcClient()
        .admin
        .feedback
        .update({
          id: report.id,
          status: editedStatus,
          adminNote: editedAdminNote.trim().length > 0 ? editedAdminNote.trim() : null,
        });

      // Refresh the page data, so the edited values become the new baseline for the unsaved-changes check
      await invalidateAll();

      recentlySaved = true;
      window.setTimeout(() => {
        recentlySaved = false;
      }, 2000);
    } catch (error) {
      alert(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      saving = false;
    }
  }

  function deleteReport(): void {
    if (!confirm(m.page_admin_feedback_detail_delete_confirm())) {
      return;
    }

    getClientSideRpcClient()
      .admin
      .feedback
      .delete({ id: report.id })
      .then(() => {
        bypassUnsavedChangesWarning = true;
        return goto('/admin/feedback');
      })
      .catch((error) => {
        alert(`ERROR: ${error.message}`);
      });
  }
</script>

<svelte:head>
  <title>{m.page_admin_feedback_detail_subtitle()} · {m.nav_app_admin()} | Apollo</title>
</svelte:head>

<div class="page-container">
  <header class="page-header">
    <div class="header-content">
      <div class="d-flex align-items-center gap-3">
        <a href="/admin/feedback" class="back-link" aria-label={m.page_admin_feedback_detail_back_label()}>
          <TablerIcon icon="arrow-left" />
        </a>
        <div>
          <h1>{categoryLabels[report.category]()}</h1>
          <p class="subtitle">{m.page_admin_feedback_detail_subtitle()}</p>
        </div>
      </div>
    </div>
    <div class="header-actions">
      <button class="btn btn-outline-danger" onclick={deleteReport}>
        <TablerIcon icon="trash" />
        {m.common_btn_label_delete()}
      </button>
    </div>
  </header>

  <div class="grid-layout">
    <section class="card">
      <div class="card-header">
        <h2>{m.page_admin_feedback_detail_subtitle()}</h2>
      </div>
      <div class="card-body">
        <div class="info-grid">
          <div class="info-item">
            <span class="label">{m.page_admin_feedback_detail_field_reporter()}</span>
            <div class="value">
              <a href="/admin/users/{report.user.id}">{report.user.displayName}</a>
            </div>
          </div>
          <div class="info-item">
            <span class="label">{m.page_admin_feedback_detail_field_created_at()}</span>
            <div class="value">{formatDate(report.createdAt)}</div>
          </div>
          <div class="info-item">
            <span class="label">{m.page_admin_feedback_detail_field_app_version()}</span>
            <div class="value monospace">{report.appVersion}</div>
          </div>
          <div class="info-item">
            <span class="label">{m.page_admin_feedback_detail_field_status()}</span>
            <div class="value">
              <select bind:value={editedStatus}>
                {#each Object.entries(statusLabels) as [status, label] (status)}
                  <option value={status}>{label()}</option>
                {/each}
              </select>
            </div>
          </div>
        </div>

        <div class="admin-note">
          <span class="label">{m.page_admin_feedback_detail_admin_note_heading()}</span>
          <textarea
            bind:value={editedAdminNote}
            rows="4"
            maxlength="4000"
            placeholder={m.page_admin_feedback_detail_admin_note_placeholder()}
          ></textarea>
        </div>

        <div class="save-row">
          {#if recentlySaved}
            <span class="saved-indicator">
              <TablerIcon icon="check" />
              {m.page_admin_feedback_detail_saved()}
            </span>
          {/if}
          <button class="btn btn-primary" onclick={saveChanges} disabled={saving}>
            {#if saving}
              <TablerIcon icon="loader-2" spin={true} />
            {:else}
              <TablerIcon icon="device-floppy" />
            {/if}
            {m.common_btn_label_save()}
          </button>
        </div>
      </div>
    </section>

    <div class="content-column">
      <section class="card">
        <div class="card-header">
          <h2>{m.page_admin_feedback_detail_message_heading()}</h2>
        </div>
        <div class="card-body">
          <p class="report-message">{report.message}</p>
        </div>
      </section>

      <section class="card">
        <div class="card-header">
          <h2>{m.page_admin_feedback_detail_context_heading()}</h2>
        </div>
        <div class="card-body">
          {#if report.context != null}
            <pre class="context-json">{JSON.stringify(report.context, null, 2)}</pre>
          {:else}
            <p class="context-none">{m.page_admin_feedback_detail_context_none()}</p>
          {/if}
        </div>
      </section>
    </div>
  </div>
</div>

<style>
  .page-container {
    max-width: 1000px;
    margin:    0 auto;
    padding:   20px;
  }

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

  .btn-outline-danger {
    color:        #ff6b6b;
    border-color: #ff6b6b;
    background:   transparent;
  }

  .btn-outline-danger:hover {
    background: rgba(255, 107, 107, 0.1);
  }

  .btn-primary {
    background-color: var(--primary-color, #007bff);
    color:            white;
  }

  .btn-primary:hover:not(:disabled) {
    filter: brightness(110%);
  }

  .btn-primary:disabled {
    opacity: 0.6;
    cursor:  not-allowed;
  }

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

  .content-column {
    display:        flex;
    flex-direction: column;
    gap:            24px;
    min-width:      0;
  }

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

  .info-grid {
    display:        flex;
    flex-direction: column;
    gap:            16px;
    margin-bottom:  20px;
  }

  .info-item {
    display:         flex;
    justify-content: space-between;
    align-items:     center;
    gap:             12px;
    padding-bottom:  12px;
    border-bottom:   1px solid var(--border-color);
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

  .value a {
    color: var(--text-primary);
  }

  select {
    background-color: var(--tertiary-bg, #252525);
    color:            var(--text-primary, #fff);
    border:           1px solid var(--border-color, #333);
    border-radius:    8px;
    padding:          6px 10px;
  }

  .admin-note {
    display:        flex;
    flex-direction: column;
    gap:            8px;
    margin-bottom:  20px;
  }

  .admin-note textarea {
    background-color: var(--tertiary-bg, #252525);
    color:            var(--text-primary, #fff);
    border:           1px solid var(--border-color, #333);
    border-radius:    8px;
    padding:          10px 12px;
    resize:           vertical;
  }

  .admin-note textarea:focus {
    border-color: var(--input-focus-border, #555);
    outline:      none;
  }

  .save-row {
    display:         flex;
    justify-content: flex-end;
    align-items:     center;
    gap:             12px;
  }

  .saved-indicator {
    display:     inline-flex;
    align-items: center;
    gap:         4px;
    color:       #68d391;
    font-size:   0.9rem;
    font-weight: 600;
  }

  .report-message {
    margin:      0;
    white-space: pre-wrap;
    word-break:  break-word;
    color:       var(--text-primary);
  }

  .context-json {
    background-color: var(--tertiary-bg, #252525);
    border:           1px solid var(--border-color, #333);
    border-radius:    8px;
    padding:          12px;
    margin:           0;
    max-height:       500px;
    overflow:         auto;
    font-size:        0.8rem;
    white-space:      pre-wrap;
    word-break:       break-word;
    color:            var(--text-primary);
  }

  .context-none {
    margin: 0;
    color:  var(--text-secondary);
  }
</style>
