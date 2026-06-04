<script lang="ts">
  import LazyTreeView from '$lib/components/tree-view/LazyTreeView.svelte';
  import TablerIcon from '$lib/components/TablerIcon.svelte';
  import type { TreeItemContext, TreeNode } from '$lib/components/tree-view/TreeView.types.js';
  import type ApolloFilePickerState from './ApolloFilePickerState.svelte.js';
  import type { DirRef } from './ApolloFilePickerState.svelte.js';

  let { controller }: { controller: ApolloFilePickerState } = $props();

  let treeRef: {
    collapseAll: () => void,
    expandToPath: (pathIds: string[], opts?: { reloadLast?: boolean }) => Promise<void>,
  } | undefined = $state();
  let treeSelectedId = $state<string | null>(null);

  function toNode(dir: DirRef): TreeNode<DirRef> {
    return { id: dir.uri, label: dir.name, expandable: true, data: dir };
  }

  const roots = $derived(controller.treeRoots.map(toNode));

  async function loadChildren(node: TreeNode<DirRef>): Promise<TreeNode<DirRef>[]> {
    const children = await controller.listDirectories(node.id);
    return children.map(toNode);
  }

  function collapseAll(): void {
    treeRef?.collapseAll();
  }

  /** Expand the tree down to the directory currently shown in the list (refreshing only it). */
  async function locate(): Promise<void> {
    if (controller.currentDirectory == null) {
      return;
    }
    await treeRef?.expandToPath(controller.breadcrumbs.map((crumb) => crumb.uri), { reloadLast: true });
  }
</script>

<div class="tree-pane">
  <div class="tree-toolbar">
    <button type="button" class="icon-btn" title="Collapse all" aria-label="Collapse all" onclick={collapseAll}>
      <TablerIcon icon="arrows-diagonal-minimize" />
    </button>
    <button
      type="button"
      class="icon-btn"
      title="Locate current folder in tree"
      aria-label="Locate current folder in tree"
      onclick={locate}
    >
      <TablerIcon icon="current-location" />
    </button>
  </div>

  <div class="tree-scroll">
    {#key controller.currentFileSystem?.uri}
      {#if roots.length > 0}
        <LazyTreeView
          {roots}
          label="Directories"
          {loadChildren}
          bind:this={treeRef}
          bind:selectedId={treeSelectedId}
          selectionFollowsFocus={false}
          reloadOnExpand={true}
          emptyLabel=""
          item={treeRow}
          onSelect={(node) => void controller.navigateTo(node.id)}
        />
      {/if}
    {/key}
  </div>
</div>

{#snippet treeRow(ctx: TreeItemContext<DirRef>)}
  <TablerIcon icon={ctx.expanded ? 'folder-open' : 'folder-filled'} />
  <span>{ctx.node.label}</span>
{/snippet}

<style>
  .tree-pane {
    display:        flex;
    flex-direction: column;
    min-height:     0;
    flex:           1 1 0;
  }

  .tree-toolbar {
    display:         flex;
    justify-content: flex-end;
    gap:             0.35rem;
    padding:         0.45rem 0.6rem;
    border-bottom:   1px solid var(--fp-border, #2b2f3a);
  }

  .icon-btn {
    display:          inline-flex;
    align-items:      center;
    justify-content:  center;
    padding:          0.35rem;
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

  .tree-scroll {
    flex:       1 1 0;
    min-height: 0;
    overflow:   auto;
    padding:    0.4rem;
    /* directory rows use the folder accent for their icon */
    --tree-folder-color: var(--fp-folder, #d9bd7a);
  }

  .tree-scroll :global(.tabler-icon) {
    color: var(--tree-folder-color);
  }
</style>
