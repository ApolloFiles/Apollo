<svelte:head>
    <title>{data.pageData.library.displayName} | Media library</title>
</svelte:head>

<script lang="ts">
  import type {MediaOverviewByLibraryPageData} from '../../../../../../src/frontend/FrontendRenderingDataAccess';
  import MediaOverviewContent from '../../lib/MediaOverviewContent.svelte';
  import MediaPageLayout from '../../lib/MediaPageLayout.svelte';

  const {data}: { data: MediaOverviewByLibraryPageData } = $props();
</script>

<MediaPageLayout pageData={data.pageData}>
    <MediaOverviewContent
            h1={`Library '${data.pageData.library.displayName}'`}
            pageData={data.pageData}
    />
</MediaPageLayout>
