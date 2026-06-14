<script lang="ts">
  import MediaOverviewSectionGrid from '$lib/components/media/library/MediaOverviewSectionGrid.svelte';
  import type { PageProps } from './$types';

  const { data }: PageProps = $props();
</script>

<svelte:head>
  <title>Search · Apollo Media</title>
</svelte:head>

{#if data.page.query.length === 0}
  <p class="text-center text-muted mt-5">
    Type a title in the search bar to find media.
  </p>
{:else if data.page.results.length === 0}
  <p class="text-center text-muted mt-5">
    No media found for "{data.page.query}".
  </p>
{:else}
  <MediaOverviewSectionGrid
    title="Results for &quot;{data.page.query}&quot;"
    items={data.page.results}
    loadAllImagesLazy={false}
  />
{/if}
