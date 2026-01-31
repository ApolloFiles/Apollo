<script lang="ts">
  import LibraryView from '$lib/components/media/library/_LibraryView.svelte';
  import type { PageProps } from './$types';

  const { data }: PageProps = $props();
</script>

<svelte:head>
  <title>Apollo Media</title>
</svelte:head>

<LibraryView
  continueWatchingItems={data.page.continueWatching}
  mediaItems={data.page.result.items}
  mediaItemsOrder={data.page.result.order}
  mediaItemsDisplayAsRow={true}
/>
