<svelte:head>
  <title>{episodeTitlePrefix}{data.pageData.media.title}</title>
</svelte:head>

<script lang="ts">
  import {onMount} from 'svelte';
  import type {MediaWatchPageData} from '../../../../../src/frontend/FrontendRenderingDataAccess';
  import HtmlVideoPlayerBackend from './lib/client-side/HtmlVideoPlayerBackend';
  import VideoPlayer from './lib/client-side/VideoPlayer.svelte';
  import VideoPlayerUI from './lib/video-player-ui/VideoPlayerUI.svelte';

  const {data}: { data: MediaWatchPageData } = $props();

  const episodeTitlePrefix = data.pageData.media.episode ? `S${data.pageData.media.episode.season.toString().padStart(2, '0')}E${data.pageData.media.episode.episode.toString().padStart(2, '0')} • ` : '';
  let videoContainerRef: HTMLDivElement;

  async function createVideoPlayer() {
    const backend = await HtmlVideoPlayerBackend.create(videoContainerRef, {backend: {src: '/_dev/BigBuckBunny_320x180.mp4'}});
    return new VideoPlayer(backend);
  }

  let videoPlayerPromise: Promise<VideoPlayer> | undefined = $state(undefined);

  onMount(() => {
    videoPlayerPromise = createVideoPlayer();
  });
</script>

<!-- TODO: keyboard shortcuts? :3 -->
<main class="watch-main" id="_tmp_id_watch_main">
  <div class="video-container" bind:this={videoContainerRef}></div>

  {#await videoPlayerPromise}
    <!-- TODO: Show loading spinner or something -->
    Loading…
  {:then videoPlayer}
    {#if videoPlayer}
      <VideoPlayerUI mediaInfo={data.pageData.media} videoPlayer={videoPlayer}/>
    {:else}
      <!-- TODO: Show loading spinner or something -->
      Loading…
    {/if}
  {/await}
</main>

<style>
  main {
    width:            100vw;
    height:           100vh;
    background-color: black;
    display:          flex;
    justify-content:  center;
  }

  .video-container {
    display: contents;
  }

  :global(.video-container video) {
    max-width:  100%;
    max-height: 100%;
  }
</style>
