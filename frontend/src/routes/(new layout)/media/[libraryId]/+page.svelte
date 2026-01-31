<script lang="ts">
  import LibraryView from '$lib/components/media/library/_LibraryView.svelte';
  import type { PageProps } from './$types';

  const { data, params }: PageProps = $props();
  const libraryTitle = $derived(data.page.libraries.owned.find(l => l.id === params.libraryId)?.name || data.page.libraries.sharedWith.find(l => l.id === params.libraryId)?.name || '');
</script>

<svelte:head>
  <title>{libraryTitle} | Apollo Media</title>
</svelte:head>

<LibraryView
  continueWatchingItems={data.page.continueWatching}
  mediaItems={data.page.result.items}
  mediaItemsOrder={data.page.result.order}
  mediaItemsDisplayAsRow={false}
/>
