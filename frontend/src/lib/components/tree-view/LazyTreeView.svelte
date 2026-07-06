<script lang="ts" generics="T">
  import type { Snippet } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import { m } from '$lib/paraglide/messages.js';
  import TablerIcon from '$lib/components/TablerIcon.svelte';
  import TreeView from './TreeView.svelte';
  import type { LoadChildren, TreeItemContext, TreeNode } from './TreeView.types.js';

  let {
    roots,
    label,
    loadChildren,
    selectedId = $bindable(null),
    expandedIds = $bindable(new SvelteSet<string>()),
    selectionFollowsFocus = true,
    reloadOnExpand = false,
    item,
    emptyLabel = m.component_lazy_tree_empty(),
    onActivate,
    onSelect,
  }: {
    /** Initial root nodes. Children may be `undefined` and are fetched on first expand. */
    roots: TreeNode<T>[],
    label: string,
    /** Fetches a node's children on demand; the result is cached on `node.children`. */
    loadChildren: LoadChildren<T>,
    selectedId?: string | null,
    expandedIds?: SvelteSet<string>,
    selectionFollowsFocus?: boolean,
    /**
     * When `false` (default) children are fetched once and reused on re-open (cache).
     * When `true` every expand re-fetches; the previously-loaded children stay visible
     * with a loading indicator until the fresh data arrives.
     */
    reloadOnExpand?: boolean,
    item: Snippet<[TreeItemContext<T>]>,
    /** Text shown under a node that loaded with no children. */
    emptyLabel?: string,
    onActivate?: (node: TreeNode<T>) => void,
    onSelect?: (node: TreeNode<T>) => void,
  } = $props();

  // Deep-reactive working copy so writing `node.children` updates the tree.
  // svelte-ignore state_referenced_locally
  let nodes = $state(roots);

  let treeRef: { expandAll: () => void, collapseAll: () => void } | undefined = $state();

  const loadingIds = new SvelteSet<string>();
  const errorIds = new SvelteSet<string>();

  async function load(node: TreeNode<T>): Promise<void> {
    if (loadingIds.has(node.id)) {
      return;
    }

    errorIds.delete(node.id);
    loadingIds.add(node.id);
    // Snapshot already-loaded children so a reload can carry their (cached, possibly
    // still-expanded) subtrees across.
    const cachedById = new Map((node.children ?? []).map((child) => [child.id, child]));
    try {
      const fresh = await loadChildren(node);
      // Merge fresh into cached: take the fresh nodes (updated label/data, plus any
      // additions/removals/reordering), but preserve each child's already-loaded
      // subtree when it still exists. Descendants thus keep their data and expansion
      // state and are NOT re-fetched just because the parent was reloaded.
      for (const child of fresh) {
        const cached = cachedById.get(child.id);
        if (cached?.children !== undefined) {
          child.children = cached.children;
        }
      }
      node.children = fresh;
    } catch {
      errorIds.add(node.id);
    } finally {
      loadingIds.delete(node.id);
    }
  }

  function handleExpand(node: TreeNode<T>): void {
    if (node.children !== undefined && !reloadOnExpand) {
      return; // already loaded (cached)
    }

    // With reloadOnExpand, keep the stale children visible while the refetch runs
    // (load() only overwrites node.children once the new data resolves).
    void load(node);
  }

  function retry(event: MouseEvent, node: TreeNode<T>): void {
    event.stopPropagation();
    node.children = undefined;
    void load(node);
  }

  /** Collapse every node. */
  export function collapseAll(): void {
    treeRef?.collapseAll();
  }

  /**
   * Reveal a node by walking `pathIds` from the roots, lazily loading and expanding each
   * ancestor along the way (reusing the children cache), then selecting the final node.
   *
   * With `reloadLast`, the final directory is force-refetched (its cached children are
   * discarded first) — ancestors still come from cache. Stops gracefully if a segment
   * can't be found among the loaded children.
   */
  export async function expandToPath(pathIds: string[], opts?: { reloadLast?: boolean }): Promise<void> {
    let level: TreeNode<T>[] = nodes;

    for (let i = 0; i < pathIds.length; i++) {
      const id = pathIds[i];
      const node = level.find((candidate) => candidate.id === id);
      if (node == null) {
        return; // segment not found among loaded children — stop gracefully
      }

      const isLast = i === pathIds.length - 1;
      if (isLast && opts?.reloadLast) {
        node.children = undefined;
      }

      if (node.children === undefined) {
        await load(node);
      }

      expandedIds.add(node.id);
      level = node.children ?? [];
    }

    if (pathIds.length > 0) {
      selectedId = pathIds[pathIds.length - 1];
    }
  }
</script>

<TreeView
  bind:this={treeRef}
  {nodes}
  {label}
  {selectionFollowsFocus}
  bind:selectedId
  bind:expandedIds
  onExpand={handleExpand}
  {onActivate}
  {onSelect}
  item={nodeRow}
/>

{#snippet nodeRow(ctx: TreeItemContext<T>)}
  {@render item(ctx)}

  {#if loadingIds.has(ctx.node.id)}
    <TablerIcon icon="loader-2" spin class="lazy-tree-indicator" />
  {:else if errorIds.has(ctx.node.id)}
    <button type="button" class="lazy-tree-retry" tabindex={-1} onclick={(event) => retry(event, ctx.node)}>
      <TablerIcon icon="refresh" /> {m.component_lazy_tree_retry()}
    </button>
  {:else if emptyLabel && ctx.expanded && ctx.node.children != null && ctx.node.children.length === 0}
    <span class="lazy-tree-empty">{emptyLabel}</span>
  {/if}
{/snippet}

<style>
  :global(.lazy-tree-indicator) {
    color: var(--text-secondary, #a3a3a3);
  }

  .lazy-tree-retry {
    display:          inline-flex;
    align-items:      center;
    gap:              0.2rem;
    border:           none;
    background:       transparent;
    color:            var(--accent-color, #e50914);
    font:             inherit;
    font-size:        0.8em;
    cursor:           pointer;
    padding:          0;
  }

  .lazy-tree-empty {
    color:     var(--text-secondary, #a3a3a3);
    font-size: 0.8em;
    font-style: italic;
  }
</style>
