<svelte:head>
  <title>{episodeTitlePrefix}{data.pageData.media.title}</title>
</svelte:head>

<script lang="ts">
  import type {MediaWatchPageData} from '../../../../../src/frontend/FrontendRenderingDataAccess';
  import VideoPlayerUI from './lib/video-player-ui/VideoPlayerUI.svelte';

  const {data}: { data: MediaWatchPageData } = $props();

  const episodeTitlePrefix = data.pageData.media.episode ? `S${data.pageData.media.episode.season.toString().padStart(2, '0')}E${data.pageData.media.episode.episode.toString().padStart(2, '0')} • ` : '';
</script>

<main class="watch-main" id="_tmp_id_watch_main">
  <!-- svelte-ignore a11y_media_has_caption -->
  <video
    src="/_dev/BigBuckBunny_320x180.mp4"
    poster={data.pageData.media.thumbnailImageUrl}
    playsinline
    disablepictureinpicture
  ></video>

  <VideoPlayerUI mediaInfo={data.pageData.media}/>
</main>

<style>
  main {
    width:            100vw;
    height:           100vh;
    background-color: black;
    display:          flex;
    justify-content:  center;
  }

  video {
    max-width:  100%;
    max-height: 100%;
  }
</style>
