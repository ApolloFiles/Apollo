<script lang="ts">
  import Breadcrumbs from '$lib/components/breadcrumbs/Breadcrumbs.svelte';
  import TablerIcon from '$lib/components/TablerIcon.svelte';
  import SortControl from './SortControl.svelte';
  import { m } from '$lib/paraglide/messages.js';
  import type { Breadcrumb, SortDir, SortKey } from './ApolloFilePickerState.svelte.js';

  let { breadcrumbs, rootUri, loading = false, onNavigate, onRefresh, sortKey, sortDir, onSort }: {
    breadcrumbs: ReadonlyArray<Breadcrumb>,
    rootUri: string,
    /** A directory fetch is in flight — spins the refresh icon. */
    loading?: boolean,
    onNavigate: (uri: string) => void,
    onRefresh: () => void,
    sortKey: SortKey,
    sortDir: SortDir,
    onSort: (key: SortKey, dir: SortDir) => void,
  } = $props();
</script>

<div class="list-toolbar">
  <div class="actions">
    <SortControl {sortKey} {sortDir} onChange={onSort} />
    <button
      type="button"
      class="icon-btn"
      title={m.component_apollo_file_picker_toolbar_refresh()}
      aria-label={m.component_apollo_file_picker_toolbar_refresh()}
      onclick={onRefresh}
    >
      <TablerIcon icon="refresh" spin={loading} />
    </button>
  </div>

  <div class="crumbs">
    <Breadcrumbs
      segments={breadcrumbs.map((crumb) => ({ name: crumb.name, uri: crumb.uri }))}
      {rootUri}
      {onNavigate}
      label={m.component_apollo_file_picker_breadcrumbs_label()}
    />
  </div>
</div>

<style>
  .list-toolbar {
    display:        flex;
    flex-direction: column;
    gap:            0.4rem;
    padding:        0.45rem 0.6rem;
    border-bottom:  1px solid var(--fp-border, #2b2f3a);
  }

  .actions {
    display:         flex;
    align-items:     center;
    justify-content: flex-end;
    gap:             0.4rem;
  }

  .crumbs {
    min-width: 0;
  }

  .icon-btn {
    display:          inline-flex;
    align-items:      center;
    justify-content:  center;
    padding:          0.38rem;
    border:           1px solid var(--fp-border, #353a47);
    border-radius:    0.45rem;
    background-color: transparent;
    color:            var(--fp-text-muted, #9aa0b0);
    cursor:           pointer;
  }

  .icon-btn:hover {
    background-color: var(--fp-surface-2, #1f2330);
    color:            inherit;
  }

  .icon-btn:focus-visible {
    outline:        2px solid var(--fp-accent, #5b8cff);
    outline-offset: 1px;
  }
</style>
