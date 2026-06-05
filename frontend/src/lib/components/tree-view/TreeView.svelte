<script lang="ts" generics="T">
  import type { Snippet } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import TreeItem from './TreeItem.svelte';
  import { setTreeViewState, TreeViewState } from './TreeViewState.svelte.js';
  import { typeahead } from '$lib/attachments/typeahead.svelte.js';
  import type { TreeItemContext, TreeNode } from './TreeView.types.js';

  let {
    nodes,
    label,
    selectedId = $bindable(null),
    expandedIds = $bindable(new SvelteSet<string>()),
    selectionFollowsFocus = true,
    enableExpandSiblingsShortcut = false,
    enableTypeahead = true,
    item,
    onActivate,
    onSelect,
    onExpand,
    onCollapse,
  }: {
    /** Root nodes of the tree. The consumer owns this data. */
    nodes: TreeNode<T>[],
    /** Accessible name for the `role="tree"` container. */
    label: string,
    /** Id of the selected node (single-select). */
    selectedId?: string | null,
    /** Ids of expanded nodes. Use a `SvelteSet` so mutations stay reactive. */
    expandedIds?: SvelteSet<string>,
    /** When `true`, moving focus also selects the focused node. */
    selectionFollowsFocus?: boolean,
    /** Enable the `*` (asterisk) keyboard shortcut, which expands all sibling nodes at the focused level. */
    enableExpandSiblingsShortcut?: boolean,
    /** Enable JetBrains-style typeahead find. Only matches currently-rendered (expanded) nodes. */
    enableTypeahead?: boolean,
    /** Renders a node's row content (e.g. an icon + the label). */
    item: Snippet<[TreeItemContext<T>]>,
    onActivate?: (node: TreeNode<T>) => void,
    onSelect?: (node: TreeNode<T>) => void,
    onExpand?: (node: TreeNode<T>) => void,
    onCollapse?: (node: TreeNode<T>) => void,
  } = $props();

  const state = new TreeViewState<T>({
    getNodes: () => nodes,
    expandedIds,
    getSelectedId: () => selectedId,
    setSelectedId: (id) => { selectedId = id; },
    getSelectionFollowsFocus: () => selectionFollowsFocus,
    callbacks: () => ({ onActivate, onSelect, onExpand, onCollapse }),
  });
  setTreeViewState(state);

  /** Expand every expandable node. Use sparingly on large trees. */
  export function expandAll(): void {
    state.expandAll();
  }

  /** Collapse all nodes. */
  export function collapseAll(): void {
    state.collapseAll();
  }

  // JetBrains-style typeahead find. Matches currently-rendered tree items only (the lazy tree does
  // not auto-expand collapsed children). Created once so it isn't torn down as nodes change.
  const typeaheadAttach = typeahead({
    isEnabled: () => enableTypeahead,
    onMatchChange: (el) => {
      const id = el?.dataset.nodeId;
      if (id != null) {
        void state.focusNode(id);
      }
    },
    onActivate: (el) => {
      const id = el.dataset.nodeId;
      if (id != null) {
        state.activate(id);
      }
    },
  });

  function onKeyDown(event: KeyboardEvent): void {
    const id = state.focusedId ?? state.tabbableId;
    if (id == null) {
      return;
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        state.focusNext();
        break;
      case 'ArrowUp':
        event.preventDefault();
        state.focusPrev();
        break;
      case 'ArrowRight':
        event.preventDefault();
        state.moveRight(id);
        break;
      case 'ArrowLeft':
        event.preventDefault();
        state.moveLeft(id);
        break;
      case 'Home':
        event.preventDefault();
        state.focusFirst();
        break;
      case 'End':
        event.preventDefault();
        state.focusLast();
        break;
      case 'Enter':
        event.preventDefault();
        state.activate(id);
        break;
      case ' ':
        event.preventDefault();
        state.select(id);
        break;
      case '*':
        if (enableExpandSiblingsShortcut) {
          event.preventDefault();
          state.expandSiblings(id);
        }
        break;
    }
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<ul
  role="tree"
  aria-label={label}
  class="tree-view"
  onkeydown={onKeyDown}
  {@attach typeaheadAttach}
>
  {#each nodes as node (node.id)}
    <TreeItem {node} depth={0} {item} />
  {/each}
</ul>

<style>
  .tree-view {
    margin:    0;
    padding:   0;
    font-size: 0.9rem;
  }
</style>
