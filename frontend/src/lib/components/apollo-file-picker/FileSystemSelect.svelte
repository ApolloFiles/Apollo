<script lang="ts">
  import { m } from '$lib/paraglide/messages.js';
  import type { FileSystemInfo } from './ApolloFilePickerState.svelte.js';

  let { fileSystems, currentUri, onChange }: {
    fileSystems: ReadonlyArray<FileSystemInfo>,
    currentUri: string | null,
    onChange: (uri: string) => void,
  } = $props();
</script>

<label class="fs-select">
  <span class="fs-select-label">{m.component_apollo_file_picker_filesystem_label()}</span>
  <select value={currentUri ?? ''} onchange={(event) => onChange(event.currentTarget.value)}>
    {#each fileSystems as fileSystem (fileSystem.uri)}
      <option value={fileSystem.uri}>{fileSystem.displayName}</option>
    {/each}
  </select>
</label>

<style>
  .fs-select {
    display:        grid;
    gap:            0.35rem;
    padding:        0.75rem;
    border-bottom:  1px solid var(--fp-border, #2b2f3a);
  }

  .fs-select-label {
    font-size:      0.7rem;
    font-weight:    600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color:          var(--fp-text-muted, #8b90a0);
  }

  select {
    padding:          0.45rem 0.55rem;
    border:           1px solid var(--fp-border, #353a47);
    border-radius:    0.5rem;
    background-color: var(--fp-surface-2, #1b1e27);
    color:            inherit;
    font:             inherit;
    cursor:           pointer;
  }

  select:focus-visible {
    outline:        2px solid var(--fp-accent, #5b8cff);
    outline-offset: 1px;
  }
</style>
