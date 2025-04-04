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
    // const backend = await YouTubePlayerBackend.create(videoContainerRef, {backend: {videoUrlOrId: 'https://youtu.be/0PHJfOzWV3w'}});
    return new VideoPlayer(backend);
  }

  let videoPlayerPromise: Promise<VideoPlayer> | undefined = $state(undefined);

  onMount(() => {
    videoPlayerPromise = createVideoPlayer();

    return () => {
      videoPlayerPromise?.then((videoPlayer) => videoPlayer.destroy());
    };
  });
</script>

<main class="watch-main" id="_tmp_id_watch_main">
  <div class="video-container" bind:this={videoContainerRef}></div>

  {#await videoPlayerPromise}
    <div class="loading-container">
      <span class="spinner">0</span>
    </div>
  {:then videoPlayer}
    {#if videoPlayer}
      <VideoPlayerUI mediaInfo={data.pageData.media}
                     videoPlayer={videoPlayer}
                     showCustomControls={videoPlayer.$shouldShowCustomControls}/>
    {:else}
      <div class="loading-container">
        <span class="spinner">0</span>
      </div>
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

  .loading-container {
    position:  absolute;
    top:       50%;
    left:      50%;
    transform: translate(-50%, -50%);
  }

  .spinner {
    display:   inline-block;
    color:     white;
    font-size: 48px;
    animation: spin 2s infinite linear;
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
</style>
