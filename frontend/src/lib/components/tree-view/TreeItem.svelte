<script lang="ts" generics="T">
  import type { Snippet } from 'svelte';
  import TablerIcon from '$lib/components/TablerIcon.svelte';
  import TreeItem from './TreeItem.svelte';
  import { getTreeViewState, isExpandable } from './TreeViewState.svelte.js';
  import type { TreeItemContext, TreeNode } from './TreeView.types.js';

  let {
    node,
    depth,
    item,
  }: {
    node: TreeNode<T>,
    depth: number,
    item: Snippet<[TreeItemContext<T>]>,
  } = $props();

  const tree = getTreeViewState<T>();

  const expandable = $derived(isExpandable(node));
  const expanded = $derived(expandable && tree.isExpanded(node.id));
  const selected = $derived(tree.selectedId === node.id);
  const focused = $derived(tree.focusedId === node.id);
  const tabbable = $derived(tree.tabbableId === node.id);
  const children = $derived(node.children ?? []);

  let element = $state<HTMLLIElement | null>(null);
  $effect(() => {
    if (element == null) {
      return;
    }

    tree.registerElement(node.id, element);
    return () => tree.unregisterElement(node.id);
  });

  function onRowClick(): void {
    if (node.disabled) {
      return;
    }

    void tree.focusNode(node.id);
    tree.select(node.id);
  }

  function onRowDoubleClick(): void {
    if (node.disabled) {
      return;
    }

    if (expandable) {
      tree.toggle(node.id);
    }
    tree.activate(node.id);
  }

  function onTwistieClick(event: MouseEvent): void {
    // Keep focus/selection on the treeitem; the twistie only toggles expansion.
    event.stopPropagation();
    tree.toggle(node.id);
  }
</script>

<li
  bind:this={element}
  role="treeitem"
  aria-expanded={expandable ? expanded : undefined}
  aria-selected={selected}
  aria-disabled={node.disabled ? true : undefined}
  tabindex={tabbable ? 0 : -1}
  class="tree-item"
  class:selected
  class:focused
  class:disabled={node.disabled}
  style:--depth={depth}
  onfocus={() => tree.onItemFocused(node.id)}
>
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="tree-row" onclick={onRowClick} ondblclick={onRowDoubleClick}>
    {#if expandable}
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
      <span class="twistie" aria-hidden="true" onclick={onTwistieClick}>
        <TablerIcon icon={expanded ? 'chevron-down' : 'chevron-right'} />
      </span>
    {:else}
      <span class="twistie-spacer" aria-hidden="true"></span>
    {/if}

    <span class="tree-label">
      {@render item({ node, expanded, selected, focused, depth })}
    </span>
  </div>

  {#if expanded}
    <ul role="group" class="tree-group">
      {#each children as child (child.id)}
        <TreeItem node={child} depth={depth + 1} {item} />
      {/each}
    </ul>
  {/if}
</li>

<style>
  .tree-item {
    list-style: none;
    outline:    none;
  }

  .tree-row {
    display:               grid;
    grid-template-columns: 1.25rem minmax(0, 1fr);
    align-items:           center;
    gap:                   0.25rem;
    /* Indent by depth; the twistie column keeps labels aligned across levels. */
    padding-left:          calc(var(--depth) * 0.85rem);
    padding-block:         0.15rem;
    border-radius:         0.3rem;
    cursor:                pointer;
    user-select:           none;
    white-space:           nowrap;
  }

  .tree-row:hover {
    background-color: var(--hover-bg, rgba(255, 255, 255, 0.1));
  }

  .tree-item.selected > .tree-row {
    background-color: color-mix(in srgb, var(--accent-color, #e50914) 25%, transparent);
  }

  /* Roving tabindex: only the focused treeitem shows a focus ring. */
  .tree-item:focus-visible > .tree-row {
    outline:        2px solid var(--accent-color, #5e8bff);
    outline-offset: -2px;
  }

  .tree-item.disabled > .tree-row {
    opacity: 0.5;
    cursor:  default;
  }

  .twistie,
  .twistie-spacer {
    display:         inline-flex;
    align-items:     center;
    justify-content: center;
    width:           1.25rem;
    height:          1.25rem;
    border-radius:   0.25rem;
    color:           var(--text-secondary, #a3a3a3);
  }

  .twistie:hover {
    background-color: var(--hover-bg, rgba(255, 255, 255, 0.1));
  }

  .tree-label {
    overflow:        hidden;
    text-overflow:   ellipsis;
    display:         inline-flex;
    align-items:     center;
    gap:             0.4rem;
  }

  .tree-group {
    margin:  0;
    padding: 0;
  }
</style>
