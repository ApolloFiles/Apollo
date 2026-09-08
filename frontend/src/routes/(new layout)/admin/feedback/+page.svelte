<script lang="ts">
  import RelativeTime from '$lib/components/RelativeTime.svelte';
  import TablerIcon from '$lib/components/TablerIcon.svelte';
  import { m } from '$lib/paraglide/messages.js';

  let { data } = $props();

  const reports = $derived(data.reports);

  type FeedbackReport = (typeof reports)[number];
  type FeedbackReportStatus = FeedbackReport['status'];

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

  const activeReports = $derived(reports.filter((report) => !isClosed(report.status)));
  const closedReports = $derived(reports.filter((report) => isClosed(report.status)));

  function isClosed(status: FeedbackReportStatus): boolean {
    return status === 'RESOLVED' || status === 'WONT_FIX';
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
    {#if activeReports.length > 0}
      <section class="report-section">
        <h2 class="section-heading">
          {m.page_admin_feedback_section_active_heading()}
          <span class="section-count">{activeReports.length}</span>
        </h2>

        <div class="report-list">
          {#each activeReports as report (report.id)}
            {@render reportItem(report)}
          {/each}
        </div>
      </section>
    {/if}

    {#if closedReports.length > 0}
      <details class="report-section closed-section" open={activeReports.length === 0}>
        <summary>
          <TablerIcon icon="chevron-right" class="closed-section-chevron" />
          <h2 class="section-heading">
            {m.page_admin_feedback_section_closed_heading()}
            <span class="section-count">{closedReports.length}</span>
          </h2>
        </summary>

        <div class="report-list">
          {#each closedReports as report (report.id)}
            {@render reportItem(report)}
          {/each}
        </div>
      </details>
    {/if}
  {:else}
    <div class="empty-state">
      <TablerIcon icon="message-off" />
      <p>{m.page_admin_feedback_empty()}</p>
    </div>
  {/if}
</div>

{#snippet reportItem(report: FeedbackReport)}
  <a href="/admin/feedback/{report.id}" class="report-item">
    <div class="report-category-icon" class:is-bug={report.category === 'BUG'}>
      <TablerIcon icon={report.category === 'BUG' ? 'bug' : 'message'} />
    </div>

    <div class="report-info">
      <div class="report-message">{messageExcerpt(report.message)}</div>
      <div class="report-meta">
        <span>{report.user.displayName}</span>
        <span>·</span>
        <span><RelativeTime date={report.createdAt} /></span>
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
{/snippet}

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

  .report-section + .report-section {
    margin-top: 32px;
  }

  .section-heading {
    display:     flex;
    align-items: center;
    gap:         8px;
    font-size:   1.1rem;
    font-weight: 600;
    color:       var(--text-primary);
    margin:      0 0 12px 0;
  }

  .section-count {
    font-size:        0.8rem;
    font-weight:      600;
    padding:          2px 8px;
    border-radius:    999px;
    background-color: var(--tertiary-bg, #252525);
    border:           1px solid var(--border-color, #333);
    color:            var(--text-secondary, #aaa);
  }

  .closed-section > summary {
    display:     flex;
    align-items: center;
    gap:         6px;
    cursor:      pointer;
    list-style:  none;
  }

  .closed-section > summary::-webkit-details-marker {
    display: none;
  }

  .closed-section > summary .section-heading {
    color:  var(--text-secondary, #aaa);
    margin: 0;
  }

  .closed-section > summary :global(.closed-section-chevron) {
    color:      var(--text-secondary, #aaa);
    transition: transform 0.2s;
  }

  .closed-section[open] > summary {
    margin-bottom: 12px;
  }

  .closed-section[open] > summary :global(.closed-section-chevron) {
    transform: rotate(90deg);
  }

  .closed-section .report-item {
    opacity: 0.8;
  }

  .closed-section .report-item:hover,
  .closed-section .report-item:focus-visible {
    opacity: 1;
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
                      background-color 0.2s,
                      opacity 0.2s;
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
