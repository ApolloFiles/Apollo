<script lang="ts">
  import TablerIcon, { type TablerIconId } from '$lib/components/TablerIcon.svelte';

  let { title, items, loadAllImagesLazy = true, sortOrders }: {
    title: string,
    items: {
      title: string,
      libraryId: string,
      mediaId: string,
      watchProgressPercentage?: number,
    }[],
    loadAllImagesLazy?: boolean,

    sortOrders?: { id: 'recentlyAdded' | 'alphabetical', href: string, active: boolean }[],
  } = $props();

  const sortOrderIcons: { [key: string]: { icon: TablerIconId, label: string } } = {
    'recentlyAdded': { icon: 'stopwatch', label: 'sort recently added first' },
    'alphabetical': { icon: 'sort-ascending-letters', label: 'sort alphabetical' },
  };
</script>

<section>
  <div class="section-title">
    <span class="title-and-sort">
      <span>{title}</span>
      {#if sortOrders && sortOrders.length > 0}
        <span class="sort-icons">
          {#each sortOrders as sort}
            <a href={sort.href} class="sort-icon {sort.active ? 'active' : ''}" aria-label={sortOrderIcons[sort.id].label}>
              <TablerIcon icon={sortOrderIcons[sort.id].icon} />
            </a>
          {/each}
        </span>
      {/if}
    </span>
  </div>

  <div class="media-grid">
    {#each items as item, index}
      <a href="/media/{item.libraryId}/{item.mediaId}" class="media-card" data-media-card>
        {#key item.mediaId}
          <picture>
            <source srcset="/api/_frontend/media-new/{item.mediaId}/poster.avif" type="image/avif" />
            <img src="/api/_frontend/media-new/{item.mediaId}/poster.jpeg"
                 alt=""
                 loading={loadAllImagesLazy || index > 1 ? 'lazy' : 'eager'}
                 data-media-img
            />
          </picture>
        {/key}

        {#if item.watchProgressPercentage != null}
          <div class="progress mt-2 progress-bar-container" data-progress-bar-container>
            <div class="progress-bar bg-danger"
                 role="progressbar"
                 aria-valuemin="0"
                 aria-valuemax="100"
                 aria-valuenow={Math.floor(item.watchProgressPercentage * 100)}
                 style:width="{Math.floor(item.watchProgressPercentage * 100)}%"
                 aria-label="{Math.floor(item.watchProgressPercentage * 100)}% watched"
            ></div>
          </div>
        {/if}

        <div class="media-overlay" data-media-overlay>
          <div class="media-title" data-media-title>{item.title}</div>
          <div class="media-meta" data-media-meta>2024 • Action • 1h 54m</div>
        </div>
      </a>
    {/each}
  </div>
</section>

<style>
  .section-title {
    font-size:       1.2rem;
    font-weight:     600;
    margin-bottom:   15px;
    margin-top:      30px;
    display:         flex;
    align-items:     center;
    /* Remove justify-content: space-between; to allow content to hug left */
  }

  .title-and-sort {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .sort-icons {
    display: flex;
    gap: 8px;
    align-items: center;
    margin-left: 0;
  }

  .sort-icon {
    color: var(--text-secondary);
    opacity: 0.7;
    border-radius: 6px;
    padding: 2px;
    transition: background 0.15s, opacity 0.15s, color 0.15s;
    display: flex;
    align-items: center;
    text-decoration: none;
  }

  .sort-icon.active {
    color: var(--accent, #007bff);
    opacity: 1;
    background: var(--accent-bg, rgba(0,123,255,0.08));
  }

  .sort-icon:hover {
    opacity: 1;
    background: var(--accent-bg, rgba(0,123,255,0.12));
  }

  .sort-icon :global(svg) {
    display: block;
  }

  .media-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 20px;
    padding-bottom: 20px;
  }

  [data-media-card] {
    width:           100%;
    position:        relative;
    border-radius:   12px;
    overflow:        hidden;
    cursor:          pointer;
    transition:      transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
    text-decoration: none;
    color:           inherit;
    display:         block;
  }

  [data-media-card]:hover {
    transform:  scale(var(--card-hover-scale));
    z-index:    10;
    box-shadow: 0 10px 20px var(--card-shadow);
    color:      inherit;
  }

  [data-media-img] {
    width:         100%;
    height:        300px;
    object-fit:    cover;
    border-radius: 12px;
    display:       block;
  }

  [data-media-overlay] {
    position:        absolute;
    top:             0;
    left:            0;
    width:           100%;
    height:          100%;
    background:      linear-gradient(to top, var(--overlay-gradient-start) 0%, rgba(0, 0, 0, 0) 50%);
    opacity:         0;
    transition:      opacity 0.3s ease;
    display:         flex;
    flex-direction:  column;
    justify-content: flex-end;
    padding:         15px;
  }

  [data-media-card]:hover [data-media-overlay] {
    opacity: 1;
  }

  [data-media-title] {
    font-size:     1rem;
    font-weight:   600;
    margin-bottom: 5px;
  }

  [data-media-meta] {
    font-size: 0.8rem;
    color:     var(--text-secondary);
  }

  [data-progress-bar-container] {
    height:           4px;
    background-color: #333;
  }

  @media (max-width: 768px) {
    .media-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 14px;
    }

    [data-media-img] {
      height:           auto;
      aspect-ratio:     2 / 3;
      object-fit:       contain;
      object-position:  center top;
      background-color: #000;
    }
  }
</style>
