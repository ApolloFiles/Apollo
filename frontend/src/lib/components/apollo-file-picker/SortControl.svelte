<script lang="ts">
  import TablerIcon, { type TablerIconId } from '$lib/components/TablerIcon.svelte';
  import { m } from '$lib/paraglide/messages.js';
  import type { SortDir, SortKey } from './ApolloFilePickerState.svelte.js';

  let { sortKey, sortDir, onChange }: {
    sortKey: SortKey,
    sortDir: SortDir,
    onChange: (key: SortKey, dir: SortDir) => void,
  } = $props();

  const options: { key: SortKey, label: () => string, title: () => string, asc: TablerIconId, desc: TablerIconId }[] = [
    {
      key: 'name',
      label: () => m.component_apollo_file_picker_sort_name(),
      title: () => m.component_apollo_file_picker_sort_by_name(),
      asc: 'sort-ascending-letters',
      desc: 'sort-descending-letters',
    },
    {
      key: 'modified',
      label: () => m.component_apollo_file_picker_sort_modified(),
      title: () => m.component_apollo_file_picker_sort_by_modified(),
      asc: 'sort-ascending-numbers',
      desc: 'sort-descending-numbers',
    },
  ];

  // Active button shows its current direction; inactive ones hint with the ascending icon.
  function iconFor(option: (typeof options)[number]): TablerIconId {
    const dir = option.key === sortKey ? sortDir : 'asc';
    return dir === 'asc' ? option.asc : option.desc;
  }

  function pick(key: SortKey): void {
    if (key === sortKey) {
      onChange(key, sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      onChange(key, 'asc');
    }
  }
</script>

<div class="sort-control" role="group" aria-label={m.component_apollo_file_picker_sort_label()}>
  {#each options as option (option.key)}
    <button
      type="button"
      class="sort-btn"
      class:active={sortKey === option.key}
      aria-pressed={sortKey === option.key}
      title={option.title()}
      onclick={() => pick(option.key)}
    >
      <TablerIcon icon={iconFor(option)} />
      <span>{option.label()}</span>
    </button>
  {/each}
</div>

<style>
  .sort-control {
    display: inline-flex;
    gap:     0.25rem;
  }

  .sort-btn {
    display:          inline-flex;
    align-items:      center;
    gap:              0.3rem;
    padding:          0.32rem 0.55rem;
    border:           1px solid var(--fp-border, #353a47);
    border-radius:    0.45rem;
    background-color: transparent;
    color:            var(--fp-text-muted, #9aa0b0);
    font:             inherit;
    font-size:        0.82rem;
    cursor:           pointer;
  }

  .sort-btn:hover {
    background-color: var(--fp-surface-2, #1f2330);
    color:            inherit;
  }

  .sort-btn.active {
    border-color: var(--fp-accent, #5b8cff);
    color:        var(--fp-text, #eef0f6);
  }

  .sort-btn:focus-visible {
    outline:        2px solid var(--fp-accent, #5b8cff);
    outline-offset: 1px;
  }
</style>
