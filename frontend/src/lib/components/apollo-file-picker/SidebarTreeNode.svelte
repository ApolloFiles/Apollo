<script lang="ts">
  import TablerIcon from '$lib/components/TablerIcon.svelte';
  import SidebarTreeNode from './SidebarTreeNode.svelte';

  let {
    label,
    uri,
    depth,
    currentlyVisibleDirectoryUri,
    expandedUris,
    navigateToDirectory,
    toggleExpand,
    getChildren,
  }: {
    label: string,
    uri: string,
    depth: number,

    currentlyVisibleDirectoryUri: string | undefined,
    expandedUris: string[],

    navigateToDirectory: (uri: string) => void,
    toggleExpand: (uri: string) => void,
    getChildren: (uri: string) => ReadonlyArray<{ name: string, uri: string }>,
  } = $props();

  const expanded = $derived(expandedUris.includes(uri));
  const children = $derived(expanded ? getChildren(uri) : []);
</script>

<li class="tree-item">
  <div class="tree-row" style:--depth={depth}>
    <button
      type="button"
      class="tree-toggle"
      aria-label={expanded ? 'Collapse directory' : 'Expand directory'}
      onclick={() => toggleExpand(uri)}
    >
      {#if expanded}
        <TablerIcon icon="chevron-down" />
      {:else}
        <TablerIcon icon="chevron-right" />
      {/if}
    </button>

    <button
      type="button"
      class="tree-entry"
      class:selected={currentlyVisibleDirectoryUri === uri}
      onclick={() => navigateToDirectory(uri)}
    >{label}</button>
  </div>

  {#if expanded && children.length > 0}
    <ul class="subtree">
      {#each children as child (child.uri)}
        <SidebarTreeNode
          label={child.name}
          uri={child.uri}
          depth={depth + 1}

          currentlyVisibleDirectoryUri={currentlyVisibleDirectoryUri}
          expandedUris={expandedUris}

          navigateToDirectory={navigateToDirectory}
          toggleExpand={toggleExpand}
          getChildren={getChildren}
        />
      {/each}
    </ul>
  {/if}
</li>

<style>
  .tree-item {
    list-style: none;
  }

  .tree-row {
    display:               grid;
    grid-template-columns: 1.75rem minmax(0, 1fr);
    align-items:           center;
    gap:                   0.2rem;
    padding-left:          calc(var(--depth) * 0.85rem);
  }

  .subtree {
    list-style: none;
    margin:     0;
    padding:    0;
  }

  .tree-toggle,
  .tree-entry {
    border:           1px solid transparent;
    background-color: transparent;
    color:            inherit;
    font:             inherit;
  }

  .tree-toggle {
    height:        1.75rem;
    border-radius: 0.35rem;
    cursor:        pointer;
  }

  .tree-toggle:hover {
    background-color: #222;
  }

  .tree-entry {
    padding:       0.4rem 0.55rem;
    border-radius: 0.35rem;
    text-align:    left;
    white-space:   nowrap;
    overflow:      hidden;
    text-overflow: ellipsis;
    cursor:        pointer;
  }

  .tree-entry:hover {
    background-color: #1f1f1f;
  }

  .tree-entry.selected {
    border-color:     #5e8bff;
    background-color: #1c2b4f;
  }
</style>
