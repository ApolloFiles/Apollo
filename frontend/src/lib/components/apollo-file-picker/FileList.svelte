<script lang="ts">
  import TablerIcon from '$lib/components/TablerIcon.svelte';
  import { typeahead } from '$lib/attachments/typeahead.svelte.js';
  import type { FsEntry } from './ApolloFilePickerState.svelte.js';

  let { entries, highlightedUri, loading = false, onHighlight, onOpen, onNavigateUp }: {
    entries: ReadonlyArray<FsEntry>,
    highlightedUri: string | null,
    /** A background refresh is in flight: dim the list, or show a spinner if there's nothing cached. */
    loading?: boolean,
    onHighlight: (uri: string) => void,
    onOpen: (entry: FsEntry) => void,
    /** Navigate up one level (Backspace). No-op at the filesystem root. */
    onNavigateUp: () => void,
  } = $props();

  // Focus lives on the listbox itself (aria-activedescendant), never on a row — so reloading the
  // directory (which removes/replaces the option elements) can't drop focus to <body>.
  let listEl: HTMLUListElement | undefined = $state();

  const activeIndex = $derived(entries.findIndex((entry) => entry.uri === highlightedUri));
  const optionId = (index: number): string => `fp-file-opt-${index}`;
  const activeDescendant = $derived(activeIndex >= 0 ? optionId(activeIndex) : undefined);

  function move(index: number): void {
    const clamped = Math.max(0, Math.min(entries.length - 1, index));
    const entry = entries[clamped];
    if (entry == null) {
      return;
    }
    onHighlight(entry.uri);
    // aria-activedescendant doesn't auto-scroll the active option into view; do it ourselves.
    queueMicrotask(() => listEl?.querySelector(`#${optionId(clamped)}`)?.scrollIntoView({ block: 'nearest' }));
  }

  function onKeyDown(event: KeyboardEvent): void {
    // Backspace goes up a level — handled before the empty-list guard so you can leave an empty
    // folder. (While a typeahead search is active, the typeahead consumes Backspace to edit the
    // query before this handler runs.)
    if (event.key === 'Backspace') {
      event.preventDefault();
      onNavigateUp();
      return;
    }
    if (entries.length === 0) {
      return;
    }
    const base = activeIndex >= 0 ? activeIndex : 0;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        move(activeIndex < 0 ? 0 : base + 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        move(base - 1);
        break;
      case 'Home':
        event.preventDefault();
        move(0);
        break;
      case 'End':
        event.preventDefault();
        move(entries.length - 1);
        break;
      case 'Enter':
        event.preventDefault();
        if (activeIndex >= 0) {
          onOpen(entries[activeIndex]);
        }
        break;
    }
  }

  function onRowClick(entry: FsEntry): void {
    onHighlight(entry.uri);
    listEl?.focus(); // keep keyboard control after a mouse click (rows aren't focusable themselves)
  }

  /** Move keyboard focus to the listbox (used for the dialog's initial focus). */
  export function focus(): void {
    listEl?.focus();
  }

  // JetBrains-style typeahead find. Created once (stable identity) so changing entries doesn't
  // tear the attachment down; closures read the current props/entries reactively.
  const typeaheadAttach = typeahead({
    isEnabled: () => entries.length > 0,
    onMatchChange: (el) => {
      const uri = el?.dataset.uri;
      if (uri != null) {
        onHighlight(uri);
      }
    },
    onActivate: (el) => {
      const entry = entries.find((candidate) => candidate.uri === el.dataset.uri);
      if (entry != null) {
        onOpen(entry);
      }
    },
  });
</script>

<div class="file-list-wrap">
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <ul
    bind:this={listEl}
    class="file-list"
    class:dimmed={loading && entries.length > 0}
    role="listbox"
    aria-label="Files and folders"
    aria-activedescendant={activeDescendant}
    tabindex="0"
    onkeydown={onKeyDown}
    {@attach typeaheadAttach}
  >
    {#each entries as entry, index (entry.uri)}
      <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
      <li
        id={optionId(index)}
        role="option"
        aria-selected={entry.uri === highlightedUri}
        class="file-row"
        class:selected={entry.uri === highlightedUri}
        class:is-directory={entry.isDirectory}
        data-typeahead-item
        data-uri={entry.uri}
        onclick={() => onRowClick(entry)}
        ondblclick={() => onOpen(entry)}
      >
        <TablerIcon icon={entry.isDirectory ? 'folder-filled' : 'file'} />
        <span class="file-name" data-typeahead-text>{entry.name}</span>
      </li>
    {:else}
      {#if !loading}
        <li class="empty" role="presentation">This folder is empty</li>
      {/if}
    {/each}
  </ul>

  {#if loading && entries.length === 0}
    <div class="file-loading"><TablerIcon icon="loader-2" spin /> Loading…</div>
  {/if}
</div>

<style>
  .file-list-wrap {
    position:   relative;
    height:     100%;
    min-height: 0;
  }

  .file-list {
    list-style:     none;
    margin:         0;
    padding:        0.4rem;
    display:        grid;
    align-content:  start; /* otherwise auto rows stretch to fill the container height */
    gap:            0.15rem;
    overflow:       auto;
    min-height:     0;
    height:         100%;
    transition:     opacity 0.15s ease;
  }

  .file-list:focus-visible {
    outline:         2px solid var(--fp-accent, #5b8cff);
    outline-offset:  -2px;
  }

  .file-list.dimmed {
    opacity: 0.5;
  }

  .file-loading {
    position:        absolute;
    inset:           0;
    display:         flex;
    align-items:     center;
    justify-content: center;
    gap:             0.5rem;
    color:           var(--fp-text-muted, #8b90a0);
  }

  .file-row {
    display:       flex;
    align-items:   center;
    gap:           0.55rem;
    padding:       0.45rem 0.6rem;
    border:        1px solid transparent;
    border-radius: 0.45rem;
    cursor:        pointer;
    user-select:   none;
  }

  .file-row.is-directory {
    color: var(--fp-folder, #d9bd7a);
  }

  .file-row:hover {
    background-color: var(--fp-surface-2, #1f2330);
  }

  .file-row.selected {
    border-color:     var(--fp-accent, #5b8cff);
    background-color: var(--fp-accent-soft, #1d2742);
    color:            var(--fp-text, #eef0f6);
  }

  .file-name {
    white-space:   nowrap;
    overflow:      hidden;
    text-overflow: ellipsis;
  }

  .empty {
    padding:    1.5rem;
    text-align: center;
    color:      var(--fp-text-muted, #8b90a0);
    font-style: italic;
  }
</style>
