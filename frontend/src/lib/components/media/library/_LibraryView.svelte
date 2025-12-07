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
  <MediaOverviewSection title="Continue Watching"
                        items={continueWatchingItems} />
{/if}

<MediaOverviewSection title="Recently Added"
                      viewAllLink=""
                      items={recentlyAdded} />
