<script lang="ts">
  import MediaOverviewSection from '$lib/components/media/library/MediaOverviewSection.svelte';

  let { continueWatchingItems, recentlyAdded }: {
    continueWatchingItems: {
      title: string,
      libraryId: string,
      mediaId: string,
      watchProgressPercentage?: number,
    }[],
    recentlyAdded: {
      title: string,
      libraryId: string,
      mediaId: string,
      watchProgressPercentage?: number,
    }[],
  } = $props();
</script>

{#if continueWatchingItems.length > 0}
  <MediaOverviewSection
    title="Continue Watching"
    items={continueWatchingItems}
    loadAllImagesLazy={false}
  />
{/if}

{#if recentlyAdded.length > 0}
  <MediaOverviewSection
    title="Recently Added"
    viewAllLink=""
    items={recentlyAdded}
    loadAllImagesLazy={false}
  />
{/if}

{#if continueWatchingItems.length === 0 && recentlyAdded.length === 0}
  <p class="text-center text-muted mt-5">
    No media found to display
  </p>
{/if}
