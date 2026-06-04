<script lang="ts">
  import { tick } from 'svelte';
  import TablerIcon from '$lib/components/TablerIcon.svelte';
  import type { BreadcrumbSegment } from './Breadcrumbs.types.js';

  let {
    segments,
    rootUri,
    onNavigate,
    label = 'Path',
    rootLabel = 'Root',
  }: {
    /** Path segments, root excluded (the root renders as the Apollo logo). */
    segments: BreadcrumbSegment[],
    /** Uri to navigate to when the logo (root) is clicked. */
    rootUri: string,
    /** Called with a segment's (or the root's) uri when a crumb is activated. */
    onNavigate: (uri: string) => void,
    /** Accessible name for the `<nav>` landmark. */
    label?: string,
    /** Accessible name for the root (logo) button. */
    rootLabel?: string,
  } = $props();

  let scrollEl = $state<HTMLOListElement | null>(null);

  /** Cap, in rem, that a *long* segment shrinks down to (and fades past) before the bar scrolls. */
  const MIN_LABEL_REM = 5;

  /** Larger cap for the last crumb — the current directory — so it stays readable, but still bounded. */
  const CURRENT_LABEL_REM = 12;

  /**
   * Size each crumb so long names shrink-and-fade while short ones keep their natural width.
   *
   * Flexbox gives the responsive shrink, but the floor can't be expressed in CSS: with
   * `white-space: nowrap` a label's min-content is its full width, so `min-width: auto`
   * refuses to shrink it, and `min-width: 0` shrinks it to nothing without ever scrolling.
   * The trick is an *explicit pixel* `min-width` on the `<li>` — it overrides the auto
   * min-content barrier, so the item shrinks from full down to that floor and then the
   * `<ol>` scrolls. The floor is `separator-overhead + min(labelWidth, cap)` (a larger
   * `cap` for the current directory), and depends only on the text — not the container —
   * so it's stable across resizes.
   */
  function relayout(): void {
    const ol = scrollEl;
    if (ol == null) {
      return;
    }
    const rootFontPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;

    const items = [...ol.querySelectorAll<HTMLLIElement>('li:not(.root-item)')];
    // Clear floors first so the natural (unconstrained) widths can be measured.
    for (const li of items) {
      li.style.minWidth = '';
    }

    const labels: (HTMLElement | null)[] = [];
    for (const [index, li] of items.entries()) {
      const label = li.querySelector<HTMLElement>('.crumb-label');
      labels.push(label);
      if (label == null) {
        continue;
      }
      // The last crumb is the current directory — give it a larger cap so it stays readable.
      const cap = (index === items.length - 1 ? CURRENT_LABEL_REM : MIN_LABEL_REM) * rootFontPx;
      // `overhead` (separator + gaps + padding + border) is invariant under shrinking;
      // `scrollWidth` is the label's intrinsic text width.
      const overhead = li.getBoundingClientRect().width - label.getBoundingClientRect().width;
      li.style.minWidth = `${Math.ceil(overhead + Math.min(label.scrollWidth, cap))}px`;
    }

    // Toggle the fade mask once all floors are applied and the layout has settled.
    for (const label of labels) {
      label?.classList.toggle('is-clipped', label.scrollWidth > label.clientWidth + 1);
    }
  }

  // Recompute floors / fade and keep the current directory in view when the path changes.
  $effect(() => {
    segments;
    const ol = scrollEl;
    if (ol == null) {
      return;
    }
    void tick().then(() => {
      relayout();
      ol.scrollLeft = ol.scrollWidth;
    });
  });

  // Re-evaluate which labels are clipped when the available width changes.
  $effect(() => {
    const ol = scrollEl;
    if (ol == null) {
      return;
    }
    const observer = new ResizeObserver(() => relayout());
    observer.observe(ol);
    return () => observer.disconnect();
  });
</script>

<nav class="breadcrumbs" aria-label={label}>
  <ol bind:this={scrollEl}>
    <li class="root-item">
      <button
        type="button"
        class="crumb root"
        aria-label={rootLabel}
        onclick={() => onNavigate(rootUri)}
      ><img src="/logo.svg" height="20" width="20" alt="" role="presentation"></button>
    </li>
    {#each segments as seg, i (seg.uri)}
      <li>
        <span class="sep"><TablerIcon icon="chevron-right" /></span>
        <button
          type="button"
          class="crumb"
          aria-current={i === segments.length - 1 ? 'location' : undefined}
          onclick={() => onNavigate(seg.uri)}
        ><span class="crumb-label">{seg.name}</span></button>
      </li>
    {/each}
  </ol>
</nav>

<style>
  .breadcrumbs ol {
    display:     flex;
    align-items: center;
    margin:      0;
    padding:     0;
    list-style:  none;
    overflow-x:  auto;
    white-space: nowrap;
    font-size:   0.9rem;
  }

  .breadcrumbs li {
    display:     flex;
    align-items: center;
    flex:        0 1 auto;
    /* An explicit pixel `min-width` is applied per-item in JS (see `relayout`) as the
       shrink floor; it shrinks down to that, then the `<ol>` scrolls. */
  }

  /* The logo must never shrink, or its button overflows the list item and bleeds into the next crumb. */
  .breadcrumbs li.root-item {
    flex-shrink: 0;
  }

  /* Separators keep their intrinsic size; only the crumb label shrinks. A small margin
     is the only spacing around them — the crumbs themselves carry their own padding. */
  .sep {
    display:       flex;
    flex-shrink:   0;
    align-items:   center;
    margin-inline: 0.05rem;
    color:         var(--text-secondary, #a3a3a3);
  }

  .sep :global(svg) {
    width:  0.9rem;
    height: 0.9rem;
  }

  .crumb {
    display:       flex;
    align-items:   center;
    flex:          0 1 auto;
    min-width:     0;
    overflow:      hidden;
    padding:       0.3rem 0.4rem;
    border:        1px solid transparent;
    border-radius: 0.35rem;
    background:    none;
    color:         var(--text-secondary, #a3a3a3);
    cursor:        pointer;
    font:          inherit;
  }

  .crumb.root {
    flex:      0 0 auto;
    min-width: 0;
    padding:   0.3rem;
  }

  .crumb.root img {
    display: block;
  }

  .crumb:hover {
    background-color: var(--hover-bg, rgba(255, 255, 255, 0.1));
    color:            var(--text-primary, #fff);
  }

  .crumb:focus-visible {
    outline:        2px solid var(--accent-color, #e50914);
    outline-offset: -2px;
  }

  .crumb[aria-current='location'] {
    color:       var(--text-primary, #fff);
    font-weight: 600;
  }

  .crumb-label {
    display:     block;
    min-width:   0;
    overflow:    hidden;
    white-space: nowrap;
  }

  .crumb-label:global(.is-clipped) {
    -webkit-mask-image: linear-gradient(to right, #000 0, #000 calc(100% - 1rem), transparent 100%);
    mask-image:         linear-gradient(to right, #000 0, #000 calc(100% - 1rem), transparent 100%);
  }
</style>
