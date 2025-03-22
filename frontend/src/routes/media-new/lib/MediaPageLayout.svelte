<!-- FIXME: As the name suggests, this might be better suited as a +layout file -->
<script lang="ts">
  import type {MediaOverviewPageData} from '../../../../../src/frontend/FrontendRenderingDataAccess';
  import MediaSidebar from './MediaSidebar.svelte';

  const {children, pageData}: {
    children: any,
    pageData: Pick<MediaOverviewPageData['pageData'], 'libraries' | 'sharedLibraries'>
  } = $props();
</script>

<style>
  .wrapper {
    height:  calc(100vh - 4.75rem);
    display: flex;
  }

  .content {
    flex-grow:  1;
    padding:    1rem;
    overflow-y: auto;
  }
</style>

<div class="wrapper">
  <MediaSidebar pageData={pageData}/>

  <main class="content d-flex flex-row flex-wrap">
    {@render children()}
  </main>
</div>
