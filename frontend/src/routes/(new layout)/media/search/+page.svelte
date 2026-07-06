<script lang="ts">
  import MediaOverviewSectionGrid from '$lib/components/media/library/MediaOverviewSectionGrid.svelte';
  import { m } from '$lib/paraglide/messages.js';
  import type { PageProps } from './$types';

  const { data }: PageProps = $props();
</script>

<svelte:head>
  <title>{m.page_media_search_title()} | Apollo Media</title>
</svelte:head>

{#if data.page.query.length === 0}
  <p class="text-center text-muted mt-5">
    {m.page_media_search_prompt()}
  </p>
{:else if data.page.results.length === 0}
  <p class="text-center text-muted mt-5">
    {m.page_media_search_no_results({ query: data.page.query })}
  </p>
{:else}
  <MediaOverviewSectionGrid
    title={m.page_media_search_results_title({ query: data.page.query })}
    items={data.page.results}
    loadAllImagesLazy={false}
  />
{/if}
