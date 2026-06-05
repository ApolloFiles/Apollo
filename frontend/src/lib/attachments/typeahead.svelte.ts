import type { Attachment } from 'svelte/attachments';

/**
 * JetBrains-style "Speed Search" / typeahead-find as a generic Svelte attachment.
 *
 * Spread it onto any focusable container (`{@attach typeahead({ … })}`). When the container (or a
 * descendant) is focused and the user starts typing, a small search box appears in the top-right
 * corner, every substring match within the container's items is highlighted, and the first match is
 * scrolled into view. Arrow Up/Down cycle matches, Enter activates the current match, Esc / clicking
 * elsewhere / focus loss dismisses. Scrolling does not dismiss.
 *
 * The container tags its items so the attachment can discover them without knowing the markup:
 * `data-typeahead-item` on each item element and `data-typeahead-text` on the element holding the
 * visible label (falls back to the item's own text). Highlighting uses the CSS Custom Highlight API
 * so it never mutates the (Svelte-owned) DOM; if unavailable, scrolling + selection sync still work.
 */
export interface TypeaheadOptions {
  /** Selector for searchable items within the container. */
  itemSelector?: string;
  /** Selector (within an item) for the element holding its text. Falls back to the item itself. */
  textSelector?: string;
  /** Override how an item's searchable text is extracted. */
  getText?: (item: HTMLElement) => string;
  /** Gate: typeahead only activates while this returns true (e.g. the list is non-empty). */
  isEnabled?: () => boolean;
  /** Called when the current match changes, so the host can sync its real selection to it. */
  onMatchChange?: (item: HTMLElement | null) => void;
  /** Called on Enter with the current match, so the host can open/activate it. */
  onActivate?: (item: HTMLElement) => void;
}

const HIGHLIGHT_NAME = 'apollo-typeahead';
const STYLE_ID = 'apollo-typeahead-styles';

function ensureStyles(): void {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID) != null) {
    return;
  }
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    ::highlight(${HIGHLIGHT_NAME}) {
      background-color: #f5a623;
      color: #000;
    }
    .apollo-typeahead-overlay {
      position: fixed;
      z-index: 2147483000;
      display: flex;
      align-items: center;
      gap: 0.4rem;
      max-width: min(60vw, 22rem);
      padding: 0.3rem 0.55rem;
      font-size: 0.85rem;
      line-height: 1.2;
      color: var(--text-primary, #fff);
      background-color: var(--secondary-bg, #1a1c23);
      border: 1px solid var(--border-color, rgba(255, 255, 255, 0.15));
      border-radius: 0.4rem;
      box-shadow: 0 0.4rem 1.2rem rgb(0 0 0 / 0.45);
      pointer-events: auto;
    }
    .apollo-typeahead-overlay .apollo-typeahead-query {
      white-space: pre;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .apollo-typeahead-overlay .apollo-typeahead-empty {
      color: #f5a623;
    }
    .apollo-typeahead-overlay .apollo-typeahead-count {
      flex: none;
      color: var(--text-secondary, #a3a3a3);
      font-variant-numeric: tabular-nums;
    }
  `;
  document.head.appendChild(style);
}

function supportsHighlights(): boolean {
  return typeof CSS !== 'undefined' && 'highlights' in CSS && typeof Highlight !== 'undefined' && typeof Range !== 'undefined';
}

function isEditableTarget(): boolean {
  const el = document.activeElement;
  if (el == null) {
    return false;
  }
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || (el as HTMLElement).isContentEditable;
}

/** A printable key press (single character) with no command/option modifier. */
function isPrintableKey(event: KeyboardEvent): boolean {
  return event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;
}

export function typeahead(options: TypeaheadOptions = {}): Attachment {
  const itemSelector = options.itemSelector ?? '[data-typeahead-item]';
  const textSelector = options.textSelector ?? '[data-typeahead-text]';

  return (element) => {
    const node = element as HTMLElement;

    let active = false;
    let query = '';
    let matches: HTMLElement[] = [];
    let currentIndex = 0;
    let overlay: HTMLElement | null = null;
    let queryEl: HTMLElement | null = null;
    let countEl: HTMLElement | null = null;

    const isEnabled = (): boolean => options.isEnabled?.() ?? true;

    function itemText(item: HTMLElement): string {
      if (options.getText != null) {
        return options.getText(item);
      }
      const textEl = (item.querySelector(textSelector) as HTMLElement | null) ?? item;
      return textEl.textContent ?? '';
    }

    function textElementFor(item: HTMLElement): HTMLElement {
      return (item.querySelector(textSelector) as HTMLElement | null) ?? item;
    }

    function createOverlay(): void {
      ensureStyles();
      const host = node.closest('dialog') ?? document.body;
      overlay = document.createElement('div');
      overlay.className = 'apollo-typeahead-overlay';
      overlay.setAttribute('aria-hidden', 'true');
      // Clicking the box itself must do nothing (it is not an editable input).
      overlay.addEventListener('mousedown', (e) => e.preventDefault());

      const icon = document.createElement('span');
      icon.textContent = '🔍';
      icon.setAttribute('aria-hidden', 'true');

      queryEl = document.createElement('span');
      queryEl.className = 'apollo-typeahead-query';

      countEl = document.createElement('span');
      countEl.className = 'apollo-typeahead-count';

      overlay.append(icon, queryEl, countEl);
      host.appendChild(overlay);
      positionOverlay();
    }

    function positionOverlay(): void {
      if (overlay == null) {
        return;
      }
      const rect = node.getBoundingClientRect();
      overlay.style.top = `${rect.top + 8}px`;
      overlay.style.right = `${Math.max(8, window.innerWidth - rect.right + 8)}px`;
    }

    function renderOverlay(): void {
      if (queryEl == null || countEl == null) {
        return;
      }
      queryEl.textContent = query;
      if (query.length === 0) {
        countEl.textContent = '';
        queryEl.classList.remove('apollo-typeahead-empty');
      } else if (matches.length === 0) {
        countEl.textContent = '';
        queryEl.classList.add('apollo-typeahead-empty');
      } else {
        countEl.textContent = `${currentIndex + 1}/${matches.length}`;
        queryEl.classList.remove('apollo-typeahead-empty');
      }
    }

    function clearHighlight(): void {
      if (supportsHighlights()) {
        CSS.highlights.delete(HIGHLIGHT_NAME);
      }
    }

    function applyHighlight(): void {
      if (!supportsHighlights()) {
        return;
      }
      const highlight = new Highlight();
      const needle = query.toLowerCase();
      if (needle.length > 0) {
        for (const item of matches) {
          const textEl = textElementFor(item);
          const walker = document.createTreeWalker(textEl, NodeFilter.SHOW_TEXT);
          let textNode = walker.nextNode();
          while (textNode != null) {
            const haystack = (textNode.textContent ?? '').toLowerCase();
            let from = haystack.indexOf(needle);
            while (from !== -1) {
              const range = new Range();
              range.setStart(textNode, from);
              range.setEnd(textNode, from + needle.length);
              highlight.add(range);
              from = haystack.indexOf(needle, from + needle.length);
            }
            textNode = walker.nextNode();
          }
        }
      }
      CSS.highlights.set(HIGHLIGHT_NAME, highlight);
    }

    /** Scroll the current match into view and tell the host to sync its selection. */
    function syncCurrent(): void {
      const match = matches[currentIndex] ?? null;
      match?.scrollIntoView({ block: 'nearest' });
      options.onMatchChange?.(match);
      renderOverlay();
    }

    /** Recompute matches for the current query (called after the query text changes). */
    function recompute(): void {
      const needle = query.toLowerCase();
      const items = Array.from(node.querySelectorAll<HTMLElement>(itemSelector));

      if (needle.length === 0) {
        matches = [];
        currentIndex = 0;
        clearHighlight();
        renderOverlay();
        options.onMatchChange?.(null);
        return;
      }

      matches = items.filter((item) => itemText(item).toLowerCase().includes(needle));
      const prefixIndex = matches.findIndex((item) => itemText(item).toLowerCase().startsWith(needle));
      currentIndex = prefixIndex >= 0 ? prefixIndex : 0;

      applyHighlight();
      syncCurrent();
    }

    function activate(): void {
      if (active) {
        return;
      }
      active = true;
      query = '';
      matches = [];
      currentIndex = 0;
      createOverlay();
      document.addEventListener('mousedown', onDocMouseDown, true);
      window.addEventListener('scroll', positionOverlay, true);
      window.addEventListener('resize', positionOverlay);
      node.addEventListener('focusout', onFocusOut);
    }

    function deactivate(): void {
      if (!active) {
        return;
      }
      active = false;
      query = '';
      matches = [];
      currentIndex = 0;
      clearHighlight();
      overlay?.remove();
      overlay = null;
      queryEl = null;
      countEl = null;
      document.removeEventListener('mousedown', onDocMouseDown, true);
      window.removeEventListener('scroll', positionOverlay, true);
      window.removeEventListener('resize', positionOverlay);
      node.removeEventListener('focusout', onFocusOut);
    }

    function consume(event: KeyboardEvent): void {
      event.preventDefault();
      event.stopImmediatePropagation();
    }

    function onKeyDown(event: KeyboardEvent): void {
      if (!isEnabled()) {
        if (active) {
          deactivate();
        }
        return;
      }

      if (!active) {
        // Start a search on the first printable key (excluding space) while focus is inside us.
        if (isPrintableKey(event) && event.key !== ' ' && node.contains(document.activeElement) && !isEditableTarget()) {
          activate();
          query = event.key;
          recompute();
          consume(event);
        }
        return;
      }

      switch (event.key) {
        case 'Escape':
          consume(event);
          deactivate();
          return;
        case 'Backspace':
          consume(event);
          query = query.slice(0, -1);
          recompute();
          return;
        case 'Enter': {
          consume(event);
          const match = matches[currentIndex] ?? null;
          deactivate();
          if (match != null) {
            options.onActivate?.(match);
          }
          return;
        }
        case 'ArrowDown':
          if (matches.length > 0) {
            consume(event);
            currentIndex = (currentIndex + 1) % matches.length;
            syncCurrent();
          }
          return;
        case 'ArrowUp':
          if (matches.length > 0) {
            consume(event);
            currentIndex = (currentIndex - 1 + matches.length) % matches.length;
            syncCurrent();
          }
          return;
        default:
          if (isPrintableKey(event)) {
            consume(event);
            query += event.key;
            recompute();
          }
          // Everything else (Tab, lone modifiers, ArrowLeft/Right, …) is ignored: no append, no dismiss.
          return;
      }
    }

    function onDocMouseDown(event: MouseEvent): void {
      if (overlay != null && overlay.contains(event.target as Node)) {
        return;
      }
      deactivate();
    }

    function onFocusOut(event: FocusEvent): void {
      const next = event.relatedTarget as Node | null;
      if (next == null || !node.contains(next)) {
        deactivate();
      }
    }

    // Capture phase: run before the host's own keydown handler so we can consume keys we handle.
    node.addEventListener('keydown', onKeyDown, true);

    return () => {
      deactivate();
      node.removeEventListener('keydown', onKeyDown, true);
    };
  };
}
