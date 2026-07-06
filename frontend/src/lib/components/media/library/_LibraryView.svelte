<script lang="ts">
  import MediaOverviewSectionGrid from '$lib/components/media/library/MediaOverviewSectionGrid.svelte';
  import MediaOverviewSectionRow from '$lib/components/media/library/MediaOverviewSectionRow.svelte';
  import { m } from '$lib/paraglide/messages.js';

  let { continueWatchingItems, mediaItems, mediaItemsOrder, mediaItemsDisplayAsRow }: {
    continueWatchingItems: {
      title: string,
      libraryId: string,
      mediaId: string,
      year: number | null,
      watchProgressPercentage?: number,
    }[],

    mediaItems: {
      title: string,
      libraryId: string,
      mediaId: string,
      year: number | null,
      watchProgressPercentage?: number,
    }[],
    mediaItemsOrder: 'recentlyAdded' | 'alphabetical',
    mediaItemsDisplayAsRow: boolean,
  } = $props();

  let mediaItemSectionTitle = $derived(mediaItemsOrder === 'recentlyAdded' ? m.component_media_library_section_recently_added() : m.component_media_library_section_alphabetical());
</script>

{#if continueWatchingItems.length > 0}
  <MediaOverviewSectionRow
    title={m.component_media_library_section_continue_watching()}
    items={continueWatchingItems}
    loadAllImagesLazy={false}
  />
{/if}

{#if mediaItems.length > 0}
  {#if mediaItemsDisplayAsRow}
    <MediaOverviewSectionRow
      title={mediaItemSectionTitle}
      items={mediaItems}
      loadAllImagesLazy={false}
    />
  {:else}
    <MediaOverviewSectionGrid
      title={mediaItemSectionTitle}
      items={mediaItems}
      loadAllImagesLazy={false}
      sortOrders={[
        {id: 'recentlyAdded', href: '?order=recentlyAdded', active: mediaItemsOrder === 'recentlyAdded'},
        {id: 'alphabetical', href: '?order=alphabetical', active: mediaItemsOrder === 'alphabetical'},
      ]}
    />
  {/if}
{/if}

{#if continueWatchingItems.length === 0 && mediaItems.length === 0}
  <p class="text-center text-muted mt-5">
    {m.component_media_library_empty()}
  </p>
{/if}
