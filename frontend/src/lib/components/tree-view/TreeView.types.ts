/**
 * A single node in a {@link TreeView}.
 *
 * The component is generic over an arbitrary payload `T` (e.g. a file-system entry),
 * so it is not tied to directory/file trees.
 */
export interface TreeNode<T = unknown> {
  /** Stable, unique within the tree. Used as the `{#each}` key and for focus/selection/expansion tracking. */
  id: string;
  /** Human-readable name. Used as the accessible name (and, later, as the typeahead match target). */
  label: string;
  /**
   * Whether this node can have children — i.e. whether it renders a twistie and `aria-expanded`,
   * even before its children are loaded. Distinguishes an empty-but-expandable directory from a leaf file.
   *
   * When omitted, the node is treated as expandable iff it currently has a non-empty {@link children} array.
   */
  expandable?: boolean;
  /**
   * Loaded children.
   * - `undefined` — not yet loaded (lazy); used by {@link TreeView}'s wrapper to trigger a fetch.
   * - `[]` — loaded, but the node has no children.
   */
  children?: TreeNode<T>[];
  /** Disabled nodes are skipped by keyboard navigation and cannot be selected/activated. */
  disabled?: boolean;
  /** Arbitrary, typed payload for the consumer (e.g. a `FileInfo`). */
  data: T;
}

/** Argument handed to the consumer's `item` render snippet for each rendered node. */
export interface TreeItemContext<T> {
  node: TreeNode<T>;
  /** `true` if the node is expandable and currently expanded; always `false` for leaves. */
  expanded: boolean;
  selected: boolean;
  focused: boolean;
  /** 0-based depth, for indentation only (the browser infers the real ARIA level from the DOM nesting). */
  depth: number;
}

/** Consumer callbacks shared by {@link TreeView} and its lazy wrapper. */
export interface TreeViewCallbacks<T> {
  /** Fired when a node is activated (Enter / double-click / chosen). */
  onActivate?: (node: TreeNode<T>) => void;
  /** Fired when selection changes to a node. */
  onSelect?: (node: TreeNode<T>) => void;
  /** Fired when a node is expanded — the hook a lazy wrapper uses to fetch children. */
  onExpand?: (node: TreeNode<T>) => void;
  /** Fired when a node is collapsed. */
  onCollapse?: (node: TreeNode<T>) => void;
}

/** Loads the children of a node on demand. Used by `LazyTreeView`. */
export type LoadChildren<T> = (node: TreeNode<T>) => Promise<TreeNode<T>[]>;
