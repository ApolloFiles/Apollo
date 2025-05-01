<svelte:head>
  <title>{episodeTitlePrefix}{mediaTitle}</title>
</svelte:head>

<script lang="ts">
  import { onMount } from 'svelte';
  import type { AuthenticatedPageRequestData } from '../../../../../src/frontend/FrontendRenderingDataAccess';
  import type { StartPlaybackResponse } from '../../../../../src/webserver/Api/v0/media/player-session/start-playback';
  import VideoLiveTranscodeBackend from './lib/client-side/backends/VideoLiveTranscodeBackend';
  import VideoPlayer from './lib/client-side/VideoPlayer.svelte';
  import VideoPlayerUI from './lib/video-player-ui/VideoPlayerUI.svelte';

  const { data }: { data: AuthenticatedPageRequestData } = $props();

  let mediaTitle = $state('');
  let episodeTitlePrefix = $state('');

  let videoContainerRef: HTMLDivElement;

  async function createVideoPlayer(startOffset: number = 0, initialAudioTrack?: number, initialSubtitleTrack?: number) {
    const startPlaybackResponse = await fetch(`http://localhost:8080/api/v0/media/player-session/start-playback`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        //        file: 'apollo:///f/1/3/【ORIGINAL MV】PLAY DICE! _ HAKOS BAELZ/transcoded.mp4',
        file: 'apollo:///f/1/3/_S01E01 – Katrielle und das geheimnisvolle Haus.mkv',
        startOffset,
      }),
    });
    if (!startPlaybackResponse.ok) {
      throw new Error(`start-playback endpoint responded with Status ${startPlaybackResponse.status}: ${await startPlaybackResponse.text()}`);
    }

    const startPlaybackBody: StartPlaybackResponse = await startPlaybackResponse.json();

    //    const backend = await HtmlVideoPlayerBackend.create(videoContainerRef, { backend: { src: '/_dev/BigBuckBunny_320x180.mp4' }, apollo: {fileUrl: ''} });
    //    const backend = await HtmlVideoPlayerBackend.create(videoContainerRef, {
    //      backend: {
    //        src: `http://localhost:8080/api/v0/media/raw-file?file=${encodeURIComponent('apollo:///f/1/3/【ORIGINAL MV】PLAY DICE! _ HAKOS BAELZ/transcoded.mp4')}`,
    //      },
    //      apollo: {
    //        fileUrl: 'apollo:///f/1/3/【ORIGINAL MV】PLAY DICE! _ HAKOS BAELZ/transcoded.mp4',
    //      },
    //    });
    // const backend = await YouTubePlayerBackend.create(videoContainerRef, { backend: { videoUrlOrId: 'https://youtu.be/0PHJfOzWV3w' } });
    const backend = await VideoLiveTranscodeBackend.create(videoContainerRef, {
      backend: {
        src: startPlaybackBody.hlsManifest,
        initialAudioTrack,
        initialSubtitleTrack,

        totalDurationInSeconds: startPlaybackBody.totalDurationInSeconds,
        startOffset: startPlaybackBody.startOffsetInSeconds,
        restartTranscode: (startOffset, activeAudioTrack, activeSubtitleTrack) => {
          videoPlayerPromise?.then((videoPlayer) => videoPlayer.destroy());
          videoPlayerPromise = createVideoPlayer(startOffset, activeAudioTrack, activeSubtitleTrack);
        },
      },
    });

    mediaTitle = startPlaybackBody.mediaMetadata.title;
    episodeTitlePrefix = startPlaybackBody.mediaMetadata.episode ? `S${startPlaybackBody.mediaMetadata.episode.season.toString()
      .padStart(2, '0')}E${startPlaybackBody.mediaMetadata.episode.episode.toString().padStart(2, '0')} • ` : '';

    return new VideoPlayer(backend, startPlaybackBody.mediaMetadata);
  }

  let videoPlayerPromise: Promise<VideoPlayer> | undefined = $state(undefined);

  onMount(() => {
    videoPlayerPromise = createVideoPlayer();

    return () => {
      videoPlayerPromise?.then((videoPlayer) => videoPlayer.destroy());
    };
  });
</script>

<main class="watch-main">
  <div class="video-container" bind:this={videoContainerRef}></div>

  {#await videoPlayerPromise}
    <div class="loading-container">
      <span class="spinner">0</span>
    </div>
  {:then videoPlayer}
    {#if videoPlayer}
      <VideoPlayerUI
        videoPlayer={videoPlayer}
        showCustomControls={videoPlayer.$shouldShowCustomControls}
        episodeTitlePrefix={episodeTitlePrefix}
      />
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
