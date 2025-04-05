<svelte:head>
  <title>Media library</title>
</svelte:head>

<script lang="ts">
  import type { MediaOverviewPageData } from '../../../../../src/frontend/FrontendRenderingDataAccess';
  import MediaOverviewContent from '../lib/MediaOverviewContent.svelte';
  import MediaPageLayout from '../lib/MediaPageLayout.svelte';

  const { data }: { data: MediaOverviewPageData } = $props();
</script>

<MediaPageLayout pageData={data.pageData}>
  <MediaOverviewContent
    h1="Overview across all libraries"
    pageData={data.pageData}
  />
</MediaPageLayout>
