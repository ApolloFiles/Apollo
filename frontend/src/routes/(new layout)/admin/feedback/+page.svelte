<script lang="ts">
  import TablerIcon from '$lib/components/TablerIcon.svelte';
  import { m } from '$lib/paraglide/messages.js';
  import { getLocale } from '$lib/paraglide/runtime';

  let { data } = $props();

  const reports = $derived(data.reports);

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

  function formatDate(date: Date): string {
    return date.toLocaleDateString(getLocale(), {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function messageExcerpt(message: string): string {
    const firstLine = message.split('\n', 1)[0].trim();
    return firstLine.length > 140 ? `${firstLine.slice(0, 140)}…` : firstLine;
  }
</script>

<svelte:head>
  <title>{m.nav_admin_feedback()} · {m.nav_app_admin()} | Apollo</title>
</svelte:head>

<div class="page-container">
  <header class="page-header">
    <div class="header-content">
      <h1>{m.nav_admin_feedback()}</h1>
      <p class="subtitle">{m.page_admin_feedback_subtitle()}</p>
    </div>
  </header>

  {#if reports.length > 0}
    <div class="report-list">
      {#each reports as report (report.id)}
        <a href="/admin/feedback/{report.id}" class="report-item">
          <div class="report-category-icon" class:is-bug={report.category === 'BUG'}>
            <TablerIcon icon={report.category === 'BUG' ? 'bug' : 'message'} />
          </div>

          <div class="report-info">
            <div class="report-message">{messageExcerpt(report.message)}</div>
            <div class="report-meta">
              <span>{report.user.displayName}</span>
              <span>·</span>
              <span>{formatDate(report.createdAt)}</span>
              <span>·</span>
              <span class="monospace">{report.appVersion}</span>
            </div>
            <div class="badges">
              <span class="badge badge-category" class:is-bug={report.category === 'BUG'}>
                {categoryLabels[report.category]()}
              </span>
              <span class="badge badge-status-{report.status.toLowerCase()}">
                {statusLabels[report.status]()}
              </span>
            </div>
          </div>

          <div class="report-actions">
            <TablerIcon icon="chevron-right" />
          </div>
        </a>
      {/each}
    </div>
  {:else}
    <div class="empty-state">
      <TablerIcon icon="message-off" />
      <p>{m.page_admin_feedback_empty()}</p>
    </div>
  {/if}
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

  .report-list {
    display:        flex;
    flex-direction: column;
    gap:            12px;
  }

  .report-item {
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

  .report-item:hover {
    transform:        translateY(-2px);
    box-shadow:       0 4px 12px rgba(0, 0, 0, 0.1);
    background-color: var(--tertiary-bg, #252525);
    border-color:     var(--border-color-hover, #444);
  }

  .report-category-icon {
    display:          flex;
    align-items:      center;
    justify-content:  center;
    width:            48px;
    height:           48px;
    border-radius:    50%;
    background-color: rgba(66, 153, 225, 0.15);
    color:            #63b3ed;
    flex-shrink:      0;
  }

  .report-category-icon.is-bug {
    background-color: rgba(245, 101, 101, 0.15);
    color:            #fc8181;
  }

  .report-info {
    flex:           1;
    display:        flex;
    flex-direction: column;
    gap:            6px;
    min-width:      0;
  }

  .report-message {
    font-size:     1.05rem;
    font-weight:   600;
    color:         var(--text-primary, #fff);
    overflow:      hidden;
    text-overflow: ellipsis;
    white-space:   nowrap;
  }

  .report-meta {
    display:   flex;
    gap:       6px;
    font-size: 0.85rem;
    color:     var(--text-secondary, #aaa);
    flex-wrap: wrap;
  }

  .monospace {
    font-family: monospace;
  }

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

  .badge-category {
    background-color: rgba(66, 153, 225, 0.15);
    color:            #63b3ed;
    border:           1px solid rgba(66, 153, 225, 0.3);
  }

  .badge-category.is-bug {
    background-color: rgba(245, 101, 101, 0.15);
    color:            #fc8181;
    border:           1px solid rgba(245, 101, 101, 0.3);
  }

  .badge-status-open {
    background-color: rgba(246, 173, 85, 0.15);
    color:            #f6ad55;
    border:           1px solid rgba(246, 173, 85, 0.3);
  }

  .badge-status-in_progress {
    background-color: rgba(66, 153, 225, 0.15);
    color:            #63b3ed;
    border:           1px solid rgba(66, 153, 225, 0.3);
  }

  .badge-status-resolved {
    background-color: rgba(104, 211, 145, 0.15);
    color:            #68d391;
    border:           1px solid rgba(104, 211, 145, 0.3);
  }

  .badge-status-wont_fix {
    background-color: rgba(160, 174, 192, 0.15);
    color:            #a0aec0;
    border:           1px solid rgba(160, 174, 192, 0.3);
  }

  .empty-state {
    padding:        60px 40px;
    text-align:     center;
    color:          var(--text-secondary, #aaa);
    display:        flex;
    flex-direction: column;
    align-items:    center;
    gap:            12px;
  }

  .empty-state p {
    margin: 0;
  }
</style>
