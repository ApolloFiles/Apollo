import { getContext, setContext, tick } from 'svelte';
import type { SvelteSet } from 'svelte/reactivity';
import type { TreeNode, TreeViewCallbacks } from './TreeView.types.js';

interface IndexEntry<T> {
  node: TreeNode<T>;
  parentId: string | null;
  depth: number;
}

interface Walk<T> {
  /** All visible nodes (ancestors expanded), in pre-order. */
  index: Map<string, IndexEntry<T>>;
  /** Visible node ids, in pre-order — drives Up/Down/Home/End. */
  order: string[];
  /** Visible, non-disabled node ids, in pre-order — the keyboard-navigable subset. */
  navigable: string[];
}

export interface TreeViewStateOptions<T> {
  getNodes: () => TreeNode<T>[];
  expandedIds: SvelteSet<string>;
  getSelectedId: () => string | null;
  setSelectedId: (id: string | null) => void;
  getSelectionFollowsFocus: () => boolean;
  callbacks: () => TreeViewCallbacks<T>;
}

const CONTEXT_KEY = Symbol('tree_view_state');

export function setTreeViewState<T>(state: TreeViewState<T>): TreeViewState<T> {
  return setContext(CONTEXT_KEY, state);
}

export function getTreeViewState<T>(): TreeViewState<T> {
  const state = getContext(CONTEXT_KEY);
  if (state instanceof TreeViewState) {
    return state as TreeViewState<T>;
  }

  throw new Error('TreeViewState context is not set — render <TreeItem> inside a <TreeView>');
}

export function isExpandable<T>(node: TreeNode<T>): boolean {
  return node.expandable ?? ((node.children?.length ?? 0) > 0);
}

/**
 * Interaction controller for a {@link TreeView}: holds focus/selection/expansion state and the
 * methods the recursive `<TreeItem>`s and the keyboard handler call. It owns no data fetching —
 * the node array, selection and expansion are supplied (and mirrored) by the host component.
 */
export class TreeViewState<T> {
  private readonly opts: TreeViewStateOptions<T>;
  private readonly elements = new Map<string, HTMLElement>();

  /** The node that currently has (or would receive) DOM focus. */
  focusedId = $state<string | null>(null);

  private readonly walk: Walk<T> = $derived.by(() => buildWalk(this.opts.getNodes(), this.opts.expandedIds));

  constructor(opts: TreeViewStateOptions<T>) {
    this.opts = opts;
  }

  get selectedId(): string | null {
    return this.opts.getSelectedId();
  }

  /** The single node that is part of the tab sequence (roving tabindex). */
  get tabbableId(): string | null {
    const navigable = this.walk.navigable;
    if (this.focusedId != null && navigable.includes(this.focusedId)) {
      return this.focusedId;
    }

    const selectedId = this.selectedId;
    if (selectedId != null && navigable.includes(selectedId)) {
      return selectedId;
    }

    return navigable[0] ?? null;
  }

  isExpanded(id: string): boolean {
    return this.opts.expandedIds.has(id);
  }

  // --- element registration (for moving real DOM focus) ----------------------

  registerElement(id: string, element: HTMLElement): void {
    this.elements.set(id, element);
  }

  unregisterElement(id: string): void {
    this.elements.delete(id);
  }

  // --- focus -----------------------------------------------------------------

  /** Update which node is focused without moving DOM focus (used by the `focusin` handler). */
  setFocused(id: string): void {
    this.focusedId = id;
  }

  /** Move focus to a node and pull DOM focus to its element (used by keyboard navigation). */
  async focusNode(id: string): Promise<void> {
    this.focusedId = id;
    await tick();
    this.elements.get(id)?.focus();
  }

  focusFirst(): void {
    const first = this.walk.navigable[0];
    if (first != null) {
      void this.focusNode(first);
    }
  }

  focusLast(): void {
    const navigable = this.walk.navigable;
    const last = navigable[navigable.length - 1];
    if (last != null) {
      void this.focusNode(last);
    }
  }

  focusNext(): void {
    this.focusRelative(1);
  }

  focusPrev(): void {
    this.focusRelative(-1);
  }

  private focusRelative(delta: number): void {
    const navigable = this.walk.navigable;
    if (navigable.length === 0) {
      return;
    }

    const current = this.focusedId ?? this.tabbableId;
    const currentIndex = current == null ? -1 : navigable.indexOf(current);
    const nextIndex = Math.min(navigable.length - 1, Math.max(0, currentIndex + delta));
    void this.focusNode(navigable[nextIndex]);
  }

  // --- expand / collapse -----------------------------------------------------

  expand(id: string): void {
    const entry = this.walk.index.get(id);
    if (entry == null || !isExpandable(entry.node) || this.isExpanded(id)) {
      return;
    }

    this.opts.expandedIds.add(id);
    this.opts.callbacks().onExpand?.(entry.node);
  }

  collapse(id: string): void {
    if (!this.isExpanded(id)) {
      return;
    }

    this.opts.expandedIds.delete(id);
    const entry = this.walk.index.get(id);
    if (entry != null) {
      this.opts.callbacks().onCollapse?.(entry.node);
    }
  }

  toggle(id: string): void {
    if (this.isExpanded(id)) {
      this.collapse(id);
    } else {
      this.expand(id);
    }
  }

  /** Right Arrow: expand a collapsed node, else descend to the first child. */
  moveRight(id: string): void {
    const entry = this.walk.index.get(id);
    if (entry == null || !isExpandable(entry.node)) {
      return;
    }

    if (!this.isExpanded(id)) {
      this.expand(id);
      return;
    }

    const firstChild = entry.node.children?.find((child) => !child.disabled);
    if (firstChild != null) {
      void this.focusNode(firstChild.id);
    }
  }

  /** Left Arrow: collapse an expanded node, else ascend to the parent. */
  moveLeft(id: string): void {
    if (this.isExpanded(id)) {
      this.collapse(id);
      return;
    }

    const parentId = this.walk.index.get(id)?.parentId;
    if (parentId != null) {
      void this.focusNode(parentId);
    }
  }

  expandAll(): void {
    forEachNode(this.opts.getNodes(), (node) => {
      if (isExpandable(node) && !this.isExpanded(node.id)) {
        this.opts.expandedIds.add(node.id);
        this.opts.callbacks().onExpand?.(node);
      }
    });
  }

  collapseAll(): void {
    this.opts.expandedIds.clear();
  }

  /** Asterisk: expand every expandable sibling at the focused node's level. */
  expandSiblings(id: string): void {
    const parentId = this.walk.index.get(id)?.parentId ?? null;
    const siblings = parentId == null
      ? this.opts.getNodes()
      : (this.walk.index.get(parentId)?.node.children ?? []);

    for (const sibling of siblings) {
      this.expand(sibling.id);
    }
  }

  // --- selection / activation ------------------------------------------------

  select(id: string): void {
    const entry = this.walk.index.get(id);
    if (entry == null || entry.node.disabled) {
      return;
    }

    this.opts.setSelectedId(id);
    this.opts.callbacks().onSelect?.(entry.node);
  }

  activate(id: string): void {
    const entry = this.walk.index.get(id);
    if (entry == null || entry.node.disabled) {
      return;
    }

    // Single-select model: activation also selects.
    this.select(id);
    this.opts.callbacks().onActivate?.(entry.node);
  }

  /** Called by `<TreeItem>` when its row is focused; honours `selectionFollowsFocus`. */
  onItemFocused(id: string): void {
    this.setFocused(id);
    if (this.opts.getSelectionFollowsFocus()) {
      this.select(id);
    }
  }
}

function buildWalk<T>(nodes: TreeNode<T>[], expandedIds: SvelteSet<string>): Walk<T> {
  const index = new Map<string, IndexEntry<T>>();
  const order: string[] = [];
  const navigable: string[] = [];

  const visit = (node: TreeNode<T>, parentId: string | null, depth: number): void => {
    index.set(node.id, { node, parentId, depth });
    order.push(node.id);
    if (!node.disabled) {
      navigable.push(node.id);
    }

    if (isExpandable(node) && expandedIds.has(node.id) && node.children != null) {
      for (const child of node.children) {
        visit(child, node.id, depth + 1);
      }
    }
  };

  for (const node of nodes) {
    visit(node, null, 0);
  }

  return { index, order, navigable };
}

/** Depth-first walk over the full node tree (regardless of expansion). */
function forEachNode<T>(nodes: TreeNode<T>[], fn: (node: TreeNode<T>) => void): void {
  for (const node of nodes) {
    fn(node);
    if (node.children != null) {
      forEachNode(node.children, fn);
    }
  }
}
